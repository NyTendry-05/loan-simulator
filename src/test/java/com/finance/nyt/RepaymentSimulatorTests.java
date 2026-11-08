package com.finance.nyt;

import java.math.BigDecimal;
import java.util.List;
import com.finance.nyt.dto.SimulationDtos;
import com.finance.nyt.exception.BusinessException;
import com.finance.nyt.service.RepaymentCalculator;
import com.finance.nyt.service.RepaymentSimulator;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RepaymentSimulatorTests {
    private final RepaymentCalculator calculator = new RepaymentCalculator();
    private final RepaymentSimulator simulator = new RepaymentSimulator(calculator);
    private SimulationDtos.Result simulate(String principal, String rate, int months, int scale) {
        return simulator.simulate(new SimulationDtos.Request(new BigDecimal(principal), new BigDecimal(rate), months, scale));
    }

    @Test void reconcilesKnownFixedRateExampleAndAdjustsFinalPayment() {
        var result = simulate("1200", "12", 12, 2);
        assertThat(result.estimateOnly()).isTrue();
        assertThat(result.principal()).isEqualByComparingTo("1200.00");
        assertThat(result.monthlyPayment()).isEqualByComparingTo("106.62");
        assertThat(result.finalPayment()).isEqualByComparingTo("106.60");
        assertThat(result.totalInterest()).isEqualByComparingTo("79.42");
        assertThat(result.totalRepayment()).isEqualByComparingTo("1279.42");
        assertThat(result.schedule().getFirst().interest()).isEqualByComparingTo("12.00");
        assertThat(result.schedule().getFirst().principal()).isEqualByComparingTo("94.62");
        assertThat(result.assumptions()).anySatisfy(s -> assertThat(s).contains("not a loan offer"));
        assertThatThrownBy(() -> result.schedule().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertReconciles(result);
    }

    @Test void zeroRateNeverChargesRoundingAsInterest() {
        var cents = simulate("1000", "0", 3, 2);
        assertThat(cents.monthlyPayment()).isEqualByComparingTo("333.34");
        assertThat(cents.finalPayment()).isEqualByComparingTo("333.32");
        assertThat(cents.totalRepayment()).isEqualByComparingTo("1000");
        assertThat(cents.totalInterest()).isZero();
        var whole = simulate("1000", "0", 3, 0);
        assertThat(whole.monthlyPayment()).isEqualByComparingTo("334");
        assertThat(whole.finalPayment()).isEqualByComparingTo("332");
        assertReconciles(cents);
        assertReconciles(whole);
    }

    @Test void stopsAfterTinyLoanIsFullyPaidWithoutInventingZeroPaymentMonths() {
        var result = simulate("0.01", "0", 1200, 2);
        assertThat(result.termMonths()).isEqualTo(1200);
        assertThat(result.repaymentMonths()).isEqualTo(1);
        assertThat(result.schedule()).hasSize(1);
        assertThat(result.finalPayment()).isEqualByComparingTo("0.01");
        assertReconciles(result);
    }

    @Test void usesHalfEvenInterestRoundingAtCurrencyBoundaries() {
        var result = simulate("1", "6", 1, 2);
        assertThat(result.totalInterest()).isZero(); // 0.005 rounds to 0.00 under HALF_EVEN.
        assertThat(result.finalPayment()).isEqualByComparingTo("1.00");
        var up = simulate("3", "6", 1, 2);
        assertThat(up.totalInterest()).isEqualByComparingTo("0.02");
        assertReconciles(up);
        // 2 / 1200 repeats in decimal. Rounding the monthly rate before multiplication would break this exact tie.
        assertThat(simulate("3", "2", 1, 2).totalInterest()).isZero();
    }

    @Test void reconcilesLongTermsLargeAmountsAndEveryCurrencyScale() {
        for (int scale : List.of(0, 1, 2, 3, 4)) {
            for (String rate : List.of("0", "0.000001", "5", "100")) {
                for (int months : List.of(1, 3, 360, 1200)) {
                    assertReconciles(simulate("999999999999999", rate, months, scale));
                }
            }
        }
        var mortgage = simulate("100000", "5", 360, 2);
        assertThat(mortgage.monthlyPayment()).isEqualByComparingTo("536.83");
        assertThat(mortgage.finalPayment()).isEqualByComparingTo("529.72");
        assertThat(mortgage.totalInterest()).isEqualByComparingTo("93251.69");
        // At 100% over 100 years the mathematical payment is only infinitesimally above one.
        // The exact ceiling must still be 1.01, rather than dropping the remainder at DECIMAL128 precision.
        assertThat(simulate("12", "100", 1200, 2).monthlyPayment()).isEqualByComparingTo("1.01");
    }

    @Test void rejectsPrecisionThatWouldSilentlyChangeThePrincipal() {
        assertThatThrownBy(() -> simulate("12.001", "0", 12, 2)).isInstanceOf(BusinessException.class);
        assertReconciles(simulate("12.0000", "0", 12, 2));
        assertThatThrownBy(() -> calculator.monthlyPayment(null, BigDecimal.ZERO, 12, 2))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.monthlyPayment(BigDecimal.ONE, null, 12, 2))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.exactMonthlyPayment(BigDecimal.ONE, new BigDecimal("101"), 12, 2))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.exactMonthlyPayment(BigDecimal.ONE, new BigDecimal("0.0000001"), 12, 2))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private void assertReconciles(SimulationDtos.Result result) {
        BigDecimal principal = BigDecimal.ZERO, interest = BigDecimal.ZERO, paid = BigDecimal.ZERO;
        BigDecimal previousBalance = result.principal();
        int month = 0;
        for (var row : result.schedule()) {
            assertThat(row.month()).isEqualTo(++month);
            assertThat(row.payment().scale()).isEqualTo(result.currencyScale());
            assertThat(row.payment()).isPositive();
            assertThat(row.interest()).isNotNegative();
            assertThat(row.principal()).isNotNegative();
            assertThat(row.balance()).isNotNegative();
            assertThat(row.payment()).isEqualByComparingTo(row.principal().add(row.interest()));
            assertThat(row.balance()).isEqualByComparingTo(previousBalance.subtract(row.principal()));
            principal = principal.add(row.principal());
            interest = interest.add(row.interest());
            paid = paid.add(row.payment());
            previousBalance = row.balance();
        }
        assertThat(previousBalance).isZero();
        assertThat(principal).isEqualByComparingTo(result.principal());
        assertThat(interest).isEqualByComparingTo(result.totalInterest());
        assertThat(paid).isEqualByComparingTo(result.totalRepayment());
        assertThat(paid).isEqualByComparingTo(principal.add(interest));
        assertThat(result.repaymentMonths()).isEqualTo(month).isLessThanOrEqualTo(result.termMonths());
    }
}
