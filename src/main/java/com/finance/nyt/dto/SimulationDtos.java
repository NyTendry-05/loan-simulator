package com.finance.nyt.dto;

import java.math.BigDecimal;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.*;

/** Anonymous estimates contain no applicant identity, income, or lending decision. */
public final class SimulationDtos {
    private SimulationDtos() {}

    public record Request(
        @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal principal,
        @NotNull @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 6) BigDecimal annualInterestRate,
        @NotNull @Min(1) @Max(1200) Integer termMonths,
        @NotNull @Min(0) @Max(4) Integer currencyScale
    ) {}

    public record Instalment(
        int month,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal payment,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal principal,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal interest,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal balance
    ) {}

    public record Result(
        boolean estimateOnly,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal principal,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal annualInterestRate,
        int termMonths,
        int currencyScale,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal monthlyPayment,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal finalPayment,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal totalInterest,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal totalRepayment,
        int repaymentMonths,
        List<Instalment> schedule,
        List<String> assumptions
    ) {}
}
