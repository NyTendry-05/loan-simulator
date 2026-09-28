package com.finance.nyt.controller;

import java.net.URI;
import java.util.UUID;
import com.finance.nyt.dto.*;
import com.finance.nyt.security.Actor;
import com.finance.nyt.service.LoanService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/applications")
@RequiredArgsConstructor
public class LoanController {
    private final LoanService loans;
    @PostMapping
    public ResponseEntity<ApiViews.Loan> create(Authentication auth, @RequestHeader("Idempotency-Key") UUID key,
                                               @Valid @RequestBody LoanRequest request) {
        var loan = loans.create(Actor.from(auth), key, request);
        return ResponseEntity.created(URI.create("/api/v1/applications/" + loan.id())).body(loan);
    }
    @GetMapping
    public ApiViews.Paged<ApiViews.Loan> mine(Authentication auth, @RequestParam(defaultValue = "0") @Min(0) int page,
                                             @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return loans.mine(Actor.from(auth), page, size);
    }
    @GetMapping("/{id}")
    public ApiViews.Loan get(Authentication auth, @PathVariable UUID id) { return loans.get(Actor.from(auth), id); }
    @GetMapping("/{id}/events")
    public ApiViews.Paged<ApiViews.Event> history(Authentication auth, @PathVariable UUID id,
        @RequestParam(defaultValue = "0") @Min(0) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return loans.history(Actor.from(auth), id, page, size);
    }
    @PostMapping("/{id}/submit")
    public ApiViews.Loan submit(Authentication auth, @PathVariable UUID id) { return loans.submit(Actor.from(auth), id); }
    @PostMapping("/{id}/withdraw")
    public ApiViews.Loan withdraw(Authentication auth, @PathVariable UUID id) { return loans.withdraw(Actor.from(auth), id); }
}

