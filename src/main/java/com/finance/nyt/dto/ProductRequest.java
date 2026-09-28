package com.finance.nyt.dto;

import java.math.BigDecimal;
import java.util.Set;
import com.finance.nyt.model.DocumentType;
import jakarta.validation.constraints.*;

public record ProductRequest(
    @NotBlank @Pattern(regexp = "[A-Z0-9_-]{1,80}") String code,
    @NotBlank @Size(max = 120) String name,
    @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
    @Min(0) @Max(4) int currencyScale,
    @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal minAmount,
    @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal maxAmount,
    @Min(1) @Max(1200) int minTermMonths,
    @Min(1) @Max(1200) int maxTermMonths,
    @NotNull @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 6) BigDecimal annualInterestRate,
    @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("1") @Digits(integer = 1, fraction = 6) BigDecimal maxDebtToIncomeRatio,
    @NotEmpty Set<@NotNull DocumentType> requiredDocuments
) {}

