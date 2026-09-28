package com.finance.nyt.dto;
import jakarta.validation.constraints.*;
public record DecisionRequest(@NotNull Outcome outcome, @NotBlank @Size(max = 2000) String reason) {
    public enum Outcome { APPROVE, REJECT }
}

