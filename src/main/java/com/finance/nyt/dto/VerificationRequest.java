package com.finance.nyt.dto;
import jakarta.validation.constraints.*;
public record VerificationRequest(@NotNull Boolean verified, @NotBlank @Size(max = 2000) String note) {}
