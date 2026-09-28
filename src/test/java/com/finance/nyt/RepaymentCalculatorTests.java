package com.finance.nyt;

import java.math.BigDecimal;
import com.finance.nyt.service.RepaymentCalculator;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RepaymentCalculatorTests {
    private final RepaymentCalculator calculator = new RepaymentCalculator();
    private BigDecimal n(String value) { return new BigDecimal(value); }
    @Test void calculatesFixedRateInstallmentsWithConservativeCurrencyRounding() {
        var result = calculator.assess(n("1200"), n("12"), 12, n("2000"), n("100"), n("0.4"), 2);
        assertThat(result.monthlyPayment()).isEqualByComparingTo("106.62");
        assertThat(result.debtToIncomeRatio()).isEqualByComparingTo("0.103310");
        assertThat(result.withinPolicy()).isTrue();
    }
    @Test void zeroInterestAndExactAffordabilityBoundary() {
        var exact = calculator.assess(n("1200"), n("0"), 12, n("1000"), n("300"), n("0.4"), 2);
        assertThat(exact.monthlyPayment()).isEqualByComparingTo("100");
        assertThat(exact.withinPolicy()).isTrue();
        var justOver = calculator.assess(n("1200"), n("0"), 12, n("1000"), n("300.00001"), n("0.4"), 2);
        assertThat(justOver.debtToIncomeRatio()).isEqualByComparingTo("0.4");
        assertThat(justOver.withinPolicy()).isFalse();
    }
    @Test void supportsLongTermsTinyRatesAndCurrencyScales() {
        assertThat(calculator.assess(n("1000"), n("0.000001"), 1200, n("2000"), n("0"), n("0.4"), 4)
            .monthlyPayment()).isEqualByComparingTo("0.8334");
        assertThat(calculator.assess(n("1000"), n("0"), 3, n("2000"), n("0"), n("0.4"), 0)
            .monthlyPayment()).isEqualByComparingTo("334");
    }
    @Test void rejectsInvalidInputs() {
        assertThatThrownBy(() -> calculator.assess(n("0"), n("12"), 12, n("1000"), n("0"), n("0.4"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("-1"), 12, n("1000"), n("0"), n("0.4"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 0, n("1000"), n("0"), n("0.4"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 1201, n("1000"), n("0"), n("0.4"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 12, n("0"), n("0"), n("0.4"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 12, n("1000"), n("-1"), n("0.4"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 12, n("1000"), n("0"), n("0"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 12, n("1000"), n("0"), n("1.1"), 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 12, n("1000"), n("0"), n("0.4"), -1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.assess(n("1000"), n("12"), 12, n("1000"), n("0"), n("0.4"), 5)).isInstanceOf(IllegalArgumentException.class);
    }
}

