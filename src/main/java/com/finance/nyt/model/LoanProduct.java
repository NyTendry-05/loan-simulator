package com.finance.nyt.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import com.finance.nyt.dto.ProductRequest;

@Entity
@Table(name = "loan_products")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoanProduct {
    @Id private UUID id;
    @Column(nullable = false, unique = true, length = 80) private String code;
    @Column(nullable = false, length = 120) private String name;
    @Column(nullable = false, length = 3) private String currency;
    @Column(nullable = false) private int currencyScale;
    @Column(nullable = false, precision = 19, scale = 4) private BigDecimal minAmount;
    @Column(nullable = false, precision = 19, scale = 4) private BigDecimal maxAmount;
    @Column(nullable = false) private int minTermMonths;
    @Column(nullable = false) private int maxTermMonths;
    @Column(nullable = false, precision = 9, scale = 6) private BigDecimal annualInterestRate;
    @Column(nullable = false, precision = 7, scale = 6) private BigDecimal maxDebtToIncomeRatio;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "product_required_documents", joinColumns = @JoinColumn(name = "product_id"))
    @Column(name = "document_type", nullable = false, length = 40)
    @Enumerated(EnumType.STRING)
    private Set<DocumentType> requiredDocuments;
    @Column(nullable = false) private boolean active;
    @Column(nullable = false) private Instant createdAt;
    @Version private long version;

    public LoanProduct(ProductRequest request, Instant now) {
        id = UUID.randomUUID(); code = request.code(); name = request.name(); currency = request.currency();
        currencyScale = request.currencyScale(); minAmount = request.minAmount(); maxAmount = request.maxAmount();
        minTermMonths = request.minTermMonths(); maxTermMonths = request.maxTermMonths();
        annualInterestRate = request.annualInterestRate(); maxDebtToIncomeRatio = request.maxDebtToIncomeRatio();
        requiredDocuments = Set.copyOf(request.requiredDocuments()); active = true; createdAt = now;
    }
    public void deactivate() { active = false; }
}

