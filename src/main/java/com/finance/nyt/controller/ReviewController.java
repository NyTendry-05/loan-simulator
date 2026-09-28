package com.finance.nyt.controller;

import java.util.UUID;
import com.finance.nyt.dto.*;
import com.finance.nyt.model.LoanStatus;
import com.finance.nyt.security.Actor;
import com.finance.nyt.service.LoanService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reviews")
@RequiredArgsConstructor
public class ReviewController {
    private final LoanService loans;
    @GetMapping
    public ApiViews.Paged<ApiViews.Loan> queue(Authentication auth,
        @RequestParam(defaultValue = "SUBMITTED") LoanStatus status, @RequestParam(defaultValue = "0") @Min(0) int page,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return loans.queue(Actor.from(auth), status, page, size);
    }
    @PostMapping("/{id}/start")
    public ApiViews.Loan start(Authentication auth, @PathVariable UUID id) { return loans.startReview(Actor.from(auth), id); }
    @PostMapping("/{id}/decision")
    public ApiViews.Loan decide(Authentication auth, @PathVariable UUID id, @Valid @RequestBody DecisionRequest request) {
        return loans.decide(Actor.from(auth), id, request);
    }
}

