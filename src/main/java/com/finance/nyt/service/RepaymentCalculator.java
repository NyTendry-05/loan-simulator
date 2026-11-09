package com.finance.nyt.service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import com.finance.nyt.dto.ApiViews.Assessment;
import org.springframework.stereotype.Component;

@Component
public class RepaymentCalculator {
    private static final MathContext PRECISION = MathContext.DECIMAL128;
    private static final BigDecimal MONTHLY_PERCENT_DIVISOR = BigDecimal.valueOf(12 * 100);

    /** Fixed-rate amortization; rates are annual percentages. No fees or variable-rate assumptions. */
    public Assessment assess(BigDecimal principal, BigDecimal annualRate, int months,
                             BigDecimal income, BigDecimal existingDebt, BigDecimal maxRatio, int currencyScale) {
        if (income.signum() <= 0 || existingDebt.signum() < 0 || maxRatio.signum() <= 0
                || maxRatio.compareTo(BigDecimal.ONE) > 0)
            throw new IllegalArgumentException("Invalid repayment inputs");
        BigDecimal roundedPayment = monthlyPayment(principal, annualRate, months, currencyScale);
        BigDecimal totalDebt = existingDebt.add(roundedPayment);
        // Compare the ratio inputs before display rounding; display rounding must not change the decision.
        boolean withinPolicy = totalDebt.compareTo(income.multiply(maxRatio)) <= 0;
        return new Assessment(roundedPayment, totalDebt.divide(income, 6, RoundingMode.HALF_EVEN), withinPolicy);
    }

    public BigDecimal monthlyPayment(BigDecimal principal, BigDecimal annualRate, int months, int currencyScale) {
        if (principal == null || annualRate == null || principal.signum() <= 0 || annualRate.signum() < 0
                || months < 1 || months > 1200 || currencyScale < 0 || currencyScale > 4)
            throw new IllegalArgumentException("Invalid repayment inputs");
        BigDecimal payment;
        if (annualRate.signum() == 0) {
            payment = principal.divide(BigDecimal.valueOf(months), PRECISION);
        } else {
            BigDecimal rate = annualRate.divide(MONTHLY_PERCENT_DIVISOR, PRECISION);
            BigDecimal growth = BigDecimal.ONE.add(rate, PRECISION).pow(months, PRECISION);
            payment = principal.multiply(rate, PRECISION).multiply(growth, PRECISION)
                .divide(growth.subtract(BigDecimal.ONE, PRECISION), PRECISION);
        }
        return payment.setScale(currencyScale, RoundingMode.CEILING);
    }

    /** Exact rational form avoids losing a sub-cent remainder before rounding an anonymous estimate. */
    public BigDecimal exactMonthlyPayment(BigDecimal principal, BigDecimal annualRate, int months, int currencyScale) {
        // Keep the existing affordability assessment formula unchanged; this ledger uses exact decimal powers.
        monthlyPayment(principal, annualRate, months, currencyScale);
        if (annualRate.compareTo(BigDecimal.valueOf(100)) > 0 || annualRate.stripTrailingZeros().scale() > 6)
            throw new IllegalArgumentException("Rate exceeds the supported calculation precision");
        if (annualRate.signum() == 0)
            return principal.divide(BigDecimal.valueOf(months), currencyScale, RoundingMode.CEILING);
        var growth = MONTHLY_PERCENT_DIVISOR.add(annualRate.stripTrailingZeros()).pow(months);
        var denominator = MONTHLY_PERCENT_DIVISOR.multiply(growth.subtract(MONTHLY_PERCENT_DIVISOR.pow(months)));
        return principal.multiply(annualRate).multiply(growth).divide(denominator, currencyScale, RoundingMode.CEILING);
    }
}
