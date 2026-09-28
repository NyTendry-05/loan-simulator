package com.finance.nyt.dto;

import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import com.finance.nyt.model.*;
import com.finance.nyt.repository.DocumentMetadata;
import org.springframework.data.domain.Page;

public final class ApiViews {
    private ApiViews() {}
    public record Product(UUID id, String code, String name, String currency, int currencyScale,
                          @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal minAmount, @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal maxAmount, int minTermMonths, int maxTermMonths,
                          @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal annualInterestRate, @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal maxDebtToIncomeRatio,
                          Set<DocumentType> requiredDocuments, boolean active) {
        public static Product from(LoanProduct p) {
            return new Product(p.getId(), p.getCode(), p.getName(), p.getCurrency(), p.getCurrencyScale(),
                p.getMinAmount(), p.getMaxAmount(), p.getMinTermMonths(), p.getMaxTermMonths(),
                p.getAnnualInterestRate(), p.getMaxDebtToIncomeRatio(), Set.copyOf(p.getRequiredDocuments()), p.isActive());
        }
    }
    public record Assessment(@JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal monthlyPayment, @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal debtToIncomeRatio, boolean withinPolicy) {}
    public record Loan(UUID id, String applicantId, Product product, @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal amount, int termMonths,
                       @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal monthlyIncome, @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal monthlyDebt, String purpose, LoanStatus status,
                       String reviewerId, Assessment assessment, Instant createdAt, Instant updatedAt, long version) {
        public static Loan from(LoanApplication a, Assessment assessment) {
            return new Loan(a.getId(), a.getApplicantId(), Product.from(a.getProduct()), a.getAmount(), a.getTermMonths(),
                a.getMonthlyIncome(), a.getMonthlyDebt(), a.getPurpose(), a.getStatus(), a.getReviewerId(),
                assessment, a.getCreatedAt(), a.getUpdatedAt(), a.getVersion());
        }
    }
    public record Document(UUID id, DocumentType type, String mediaType, long sizeBytes, VerificationStatus status,
                           String verificationNote, Instant uploadedAt, Instant verifiedAt) {
        public static Document from(LoanDocument d) {
            return new Document(d.getId(), d.getType(), d.getMediaType(), d.getSizeBytes(), d.getStatus(),
                d.getVerificationNote(), d.getUploadedAt(), d.getVerifiedAt());
        }
        public static Document from(DocumentMetadata d) {
            return new Document(d.getId(), d.getType(), d.getMediaType(), d.getSizeBytes(), d.getStatus(),
                d.getVerificationNote(), d.getUploadedAt(), d.getVerifiedAt());
        }
    }
    public record Event(Long id, String action, LoanStatus status, String note, Instant occurredAt) {
        public static Event from(LoanEvent e) { return new Event(e.getId(), e.getAction(), e.getStatus(), e.getNote(), e.getOccurredAt()); }
    }
    public record Paged<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
        public static <T> Paged<T> from(Page<T> p) { return new Paged<>(p.getContent(), p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages()); }
    }
}
