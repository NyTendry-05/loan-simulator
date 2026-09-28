package com.finance.nyt.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import com.finance.nyt.dto.LoanRequest;
import com.finance.nyt.security.EncryptedMoneyConverter;
import com.finance.nyt.security.EncryptedStringConverter;

@Entity
@Table(name = "loan_applications", uniqueConstraints = @UniqueConstraint(columnNames = {"applicant_id", "idempotency_key"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoanApplication {
    @Id private UUID id;
    @Column(nullable = false, length = 200) private String applicantId;
    @Column(nullable = false) private UUID idempotencyKey;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "product_id") private LoanProduct product;
    @Convert(converter = EncryptedMoneyConverter.class) @Column(nullable = false, columnDefinition = "text") private BigDecimal amount;
    @Column(nullable = false) private int termMonths;
    @Convert(converter = EncryptedMoneyConverter.class) @Column(nullable = false, columnDefinition = "text") private BigDecimal monthlyIncome;
    @Convert(converter = EncryptedMoneyConverter.class) @Column(nullable = false, columnDefinition = "text") private BigDecimal monthlyDebt;
    @Convert(converter = EncryptedStringConverter.class) @Column(nullable = false, columnDefinition = "text") private String purpose;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private LoanStatus status;
    @Column(length = 200) private String reviewerId;
    @Column(nullable = false) private Instant createdAt;
    @Column(nullable = false) private Instant updatedAt;
    @Version private long version;

    public LoanApplication(String applicantId, UUID key, LoanProduct product, LoanRequest request, Instant now) {
        id = UUID.randomUUID(); this.applicantId = applicantId; idempotencyKey = key; this.product = product;
        amount = request.amount(); termMonths = request.termMonths(); monthlyIncome = request.monthlyIncome();
        monthlyDebt = request.monthlyDebt(); purpose = request.purpose(); status = LoanStatus.DRAFT;
        createdAt = now; updatedAt = now;
    }
    public void transition(LoanStatus target, Instant now) { status = target; updatedAt = now; }
    public void assign(String reviewer, Instant now) { reviewerId = reviewer; transition(LoanStatus.UNDER_REVIEW, now); }
    public void touch(Instant now) { updatedAt = now; }
    public boolean matches(LoanRequest r) {
        return product.getId().equals(r.productId()) && amount.compareTo(r.amount()) == 0 && termMonths == r.termMonths()
            && monthlyIncome.compareTo(r.monthlyIncome()) == 0 && monthlyDebt.compareTo(r.monthlyDebt()) == 0
            && purpose.equals(r.purpose());
    }
}

