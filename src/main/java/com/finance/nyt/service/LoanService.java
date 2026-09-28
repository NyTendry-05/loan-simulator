package com.finance.nyt.service;

import java.time.Clock;
import java.util.UUID;
import com.finance.nyt.dto.*;
import com.finance.nyt.exception.BusinessException;
import com.finance.nyt.model.*;
import com.finance.nyt.repository.*;
import com.finance.nyt.security.Actor;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LoanService {
    private final LoanRepository loans;
    private final ProductRepository products;
    private final DocumentRepository documents;
    private final EventRepository events;
    private final RepaymentCalculator calculator;
    private final Clock clock;

    @Transactional
    public ApiViews.Loan create(Actor actor, UUID key, LoanRequest request) {
        actor.requireCustomer();
        var existing = loans.findByApplicantIdAndIdempotencyKey(actor.subject(), key);
        if (existing.isPresent()) {
            if (!existing.get().matches(request)) throw BusinessException.conflict("Idempotency key was used with different input");
            return view(existing.get());
        }
        var product = products.findById(request.productId()).orElseThrow(BusinessException::missing);
        if (!product.isActive()) throw BusinessException.invalid("Loan product is inactive");
        if (request.amount().compareTo(product.getMinAmount()) < 0 || request.amount().compareTo(product.getMaxAmount()) > 0
                || request.termMonths() < product.getMinTermMonths() || request.termMonths() > product.getMaxTermMonths())
            throw BusinessException.invalid("Requested amount or term is outside the product limits");
        if (request.amount().stripTrailingZeros().scale() > product.getCurrencyScale()
                || request.monthlyIncome().stripTrailingZeros().scale() > product.getCurrencyScale()
                || request.monthlyDebt().stripTrailingZeros().scale() > product.getCurrencyScale())
            throw BusinessException.invalid("Monetary values exceed the product currency precision");
        var loan = loans.saveAndFlush(new LoanApplication(actor.subject(), key, product, request, clock.instant()));
        audit(loan, actor, "CREATED", null);
        return view(loan);
    }

    public ApiViews.Paged<ApiViews.Loan> mine(Actor actor, int page, int size) {
        actor.requireCustomer();
        return ApiViews.Paged.from(loans.findByApplicantId(actor.subject(), paging(page, size)).map(this::view));
    }
    public ApiViews.Paged<ApiViews.Loan> queue(Actor actor, LoanStatus status, int page, int size) {
        actor.requireOfficer();
        if (status == LoanStatus.DRAFT) throw BusinessException.invalid("Draft applications are private");
        return ApiViews.Paged.from(loans.findByStatus(status, paging(page, size)).map(this::view));
    }
    public ApiViews.Loan get(Actor actor, UUID id) { return view(readable(actor, id)); }
    public ApiViews.Paged<ApiViews.Event> history(Actor actor, UUID id, int page, int size) {
        readable(actor, id);
        return ApiViews.Paged.from(events.findByApplicationId(id,
            PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "id"))).map(ApiViews.Event::from));
    }

    @Transactional
    public ApiViews.Loan submit(Actor actor, UUID id) {
        var loan = ownedLocked(actor, id);
        if (loan.getStatus() == LoanStatus.SUBMITTED) return view(loan);
        requireStatus(loan, LoanStatus.DRAFT);
        if (!loan.getProduct().isActive()) throw BusinessException.conflict("Loan product is no longer accepting submissions");
        var uploaded = documents.findByApplicationIdOrderByUploadedAtAsc(id).stream().map(DocumentMetadata::getType).toList();
        if (!uploaded.containsAll(loan.getProduct().getRequiredDocuments()))
            throw BusinessException.invalid("Upload all required document types before submission");
        loan.transition(LoanStatus.SUBMITTED, clock.instant());
        audit(loan, actor, "SUBMITTED", null);
        return flushedView(loan);
    }

    @Transactional
    public ApiViews.Loan withdraw(Actor actor, UUID id) {
        var loan = ownedLocked(actor, id);
        if (loan.getStatus() == LoanStatus.WITHDRAWN) return view(loan);
        if (loan.getStatus() != LoanStatus.DRAFT && loan.getStatus() != LoanStatus.SUBMITTED)
            throw BusinessException.conflict("Only draft or submitted applications can be withdrawn");
        loan.transition(LoanStatus.WITHDRAWN, clock.instant());
        audit(loan, actor, "WITHDRAWN", null);
        return flushedView(loan);
    }

    @Transactional
    public ApiViews.Loan startReview(Actor actor, UUID id) {
        actor.requireOfficer();
        var loan = locked(id);
        prohibitSelfReview(actor, loan);
        if (loan.getStatus() == LoanStatus.UNDER_REVIEW && actor.subject().equals(loan.getReviewerId())) return view(loan);
        requireStatus(loan, LoanStatus.SUBMITTED);
        loan.assign(actor.subject(), clock.instant());
        audit(loan, actor, "REVIEW_STARTED", null);
        return flushedView(loan);
    }

    @Transactional
    public ApiViews.Loan decide(Actor actor, UUID id, DecisionRequest request) {
        var loan = reviewingLocked(actor, id);
        if (request.outcome() == DecisionRequest.Outcome.APPROVE) {
            var verified = documents.findByApplicationIdOrderByUploadedAtAsc(id).stream()
                .filter(d -> d.getStatus() == VerificationStatus.VERIFIED).map(DocumentMetadata::getType).toList();
            if (!verified.containsAll(loan.getProduct().getRequiredDocuments()))
                throw BusinessException.invalid("Every required document must be verified before approval");
            if (!assessment(loan).withinPolicy()) throw BusinessException.invalid("Application exceeds the product affordability policy");
            loan.transition(LoanStatus.APPROVED, clock.instant());
        } else {
            loan.transition(LoanStatus.REJECTED, clock.instant());
        }
        audit(loan, actor, "DECIDED", request.reason());
        return flushedView(loan);
    }

    LoanApplication readable(Actor actor, UUID id) {
        var loan = loans.findById(id).orElseThrow(BusinessException::missing);
        if (loan.getApplicantId().equals(actor.subject()) && actor.customer()) return loan;
        if (actor.officer() && loan.getStatus() != LoanStatus.DRAFT) return loan;
        throw BusinessException.missing();
    }
    LoanApplication ownedLocked(Actor actor, UUID id) {
        actor.requireCustomer();
        var loan = locked(id);
        if (!loan.getApplicantId().equals(actor.subject())) throw BusinessException.missing();
        return loan;
    }
    LoanApplication reviewingLocked(Actor actor, UUID id) {
        actor.requireOfficer();
        var loan = locked(id);
        prohibitSelfReview(actor, loan);
        requireStatus(loan, LoanStatus.UNDER_REVIEW);
        if (!actor.subject().equals(loan.getReviewerId()))
            throw BusinessException.forbidden("Only the assigned officer can perform this action");
        return loan;
    }
    void audit(LoanApplication loan, Actor actor, String action, String note) {
        events.save(new LoanEvent(loan.getId(), actor.subject(), action, loan.getStatus(), note, clock.instant()));
    }
    static void requireStatus(LoanApplication loan, LoanStatus expected) {
        if (loan.getStatus() != expected) throw BusinessException.conflict("Action requires status " + expected);
    }
    private void prohibitSelfReview(Actor actor, LoanApplication loan) {
        if (loan.getApplicantId().equals(actor.subject())) throw BusinessException.forbidden("Self-review is prohibited");
    }
    private LoanApplication locked(UUID id) { return loans.lockById(id).orElseThrow(BusinessException::missing); }
    private ApiViews.Assessment assessment(LoanApplication a) {
        var p = a.getProduct();
        return calculator.assess(a.getAmount(), p.getAnnualInterestRate(), a.getTermMonths(),
            a.getMonthlyIncome(), a.getMonthlyDebt(), p.getMaxDebtToIncomeRatio(), p.getCurrencyScale());
    }
    private ApiViews.Loan view(LoanApplication a) { return ApiViews.Loan.from(a, assessment(a)); }
    private ApiViews.Loan flushedView(LoanApplication a) { loans.flush(); return view(a); }
    private Pageable paging(int page, int size) { return PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id")); }
}
