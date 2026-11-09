package com.finance.nyt.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import com.finance.nyt.dto.SimulationDtos;
import com.finance.nyt.exception.BusinessException;
import org.springframework.stereotype.Service;

/** Deterministic, non-persistent fixed-rate estimate with a reconciled currency-unit ledger. */
@Service
public class RepaymentSimulator {
    private static final List<String> ASSUMPTIONS = List.of(
        "Illustrative estimate only; not a loan offer, approval, or financial advice.",
        "Fixed nominal annual interest rate divided by 12; equal monthly periods and payments at month end.",
        "No fees, taxes, insurance, late charges, variable rates, or early repayments are included.",
        "Scheduled payment is rounded up to the selected currency precision; monthly interest uses half-even rounding.",
        "The final payment is adjusted to clear the balance; rounding may repay very small loans before the requested term.",
        "The interest rate is a nominal annual rate, not a fee-inclusive APR. Currency selection does not convert amounts."
    );
    private final RepaymentCalculator calculator;

    public RepaymentSimulator(RepaymentCalculator calculator) { this.calculator = calculator; }

    public SimulationDtos.Result simulate(SimulationDtos.Request request) {
        var principal = request.principal();
        int scale = request.currencyScale();
        if (principal.stripTrailingZeros().scale() > scale)
            throw BusinessException.invalid("Principal exceeds the selected currency precision");
        principal = principal.setScale(scale, RoundingMode.UNNECESSARY);
        var regularPayment = calculator.exactMonthlyPayment(principal, request.annualInterestRate(), request.termMonths(), scale);
        var balance = principal;
        var totalInterest = BigDecimal.ZERO.setScale(scale);
        var totalRepayment = BigDecimal.ZERO.setScale(scale);
        var schedule = new ArrayList<SimulationDtos.Instalment>(request.termMonths());
        for (int month = 1; month <= request.termMonths() && balance.signum() > 0; month++) {
            var interest = balance.multiply(request.annualInterestRate())
                .divide(BigDecimal.valueOf(1200), scale, RoundingMode.HALF_EVEN);
            var due = balance.add(interest);
            var payment = month == request.termMonths() ? due : regularPayment.min(due);
            var principalPaid = payment.subtract(interest);
            balance = balance.subtract(principalPaid);
            totalInterest = totalInterest.add(interest);
            totalRepayment = totalRepayment.add(payment);
            schedule.add(new SimulationDtos.Instalment(month, payment, principalPaid, interest, balance));
        }
        return new SimulationDtos.Result(true, principal, request.annualInterestRate(), request.termMonths(), scale,
            regularPayment, schedule.getLast().payment(), totalInterest, totalRepayment, schedule.size(),
            List.copyOf(schedule), ASSUMPTIONS);
    }
}
