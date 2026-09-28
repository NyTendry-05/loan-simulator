package com.finance.nyt.security;

import java.nio.charset.StandardCharsets;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@Converter
@RequiredArgsConstructor
public class EncryptedStringConverter implements AttributeConverter<String, String> {
    private final EncryptionService encryption;
    @Override public String convertToDatabaseColumn(String value) {
        return value == null ? null : encryption.encrypt(value.getBytes(StandardCharsets.UTF_8), "loan-field");
    }
    @Override public String convertToEntityAttribute(String value) {
        return value == null ? null : new String(encryption.decrypt(value, "loan-field"), StandardCharsets.UTF_8);
    }
}

