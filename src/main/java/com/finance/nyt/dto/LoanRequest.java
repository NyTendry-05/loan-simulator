package com.finance.nyt.dto;

import java.math.BigDecimal;
import java.util.UUID;
import jakarta.validation.constraints.*;

public record LoanRequest(
    @NotNull UUID productId,
    @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal amount,
    @Min(1) @Max(1200) int termMonths,
    @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal monthlyIncome,
    @NotNull @DecimalMin("0") @Digits(integer = 15, fraction = 4) BigDecimal monthlyDebt,
    @NotBlank @Size(max = 1000) String purpose
) {}

