package com.finance.nyt.security;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@Converter
@RequiredArgsConstructor
public class EncryptedMoneyConverter implements AttributeConverter<BigDecimal, String> {
    private final EncryptionService encryption;
    @Override public String convertToDatabaseColumn(BigDecimal value) {
        return value == null ? null : encryption.encrypt(value.toPlainString().getBytes(StandardCharsets.UTF_8), "loan-money");
    }
    @Override public BigDecimal convertToEntityAttribute(String value) {
        return value == null ? null : new BigDecimal(new String(encryption.decrypt(value, "loan-money"), StandardCharsets.UTF_8));
    }
}

