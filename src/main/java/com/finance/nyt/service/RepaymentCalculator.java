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
        if (principal.signum() <= 0 || annualRate.signum() < 0 || months < 1 || months > 1200
                || income.signum() <= 0 || existingDebt.signum() < 0 || maxRatio.signum() <= 0
                || maxRatio.compareTo(BigDecimal.ONE) > 0 || currencyScale < 0 || currencyScale > 4)
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
        BigDecimal roundedPayment = payment.setScale(currencyScale, RoundingMode.CEILING);
        BigDecimal totalDebt = existingDebt.add(roundedPayment);
        // Compare unrounded amounts; a display-rounded ratio must never change the policy decision.
        boolean withinPolicy = totalDebt.compareTo(income.multiply(maxRatio)) <= 0;
        return new Assessment(roundedPayment, totalDebt.divide(income, 6, RoundingMode.HALF_EVEN), withinPolicy);
    }
}

