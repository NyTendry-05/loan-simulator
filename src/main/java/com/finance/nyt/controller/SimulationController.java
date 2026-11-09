package com.finance.nyt.controller;

import com.finance.nyt.dto.SimulationDtos;
import com.finance.nyt.service.RepaymentSimulator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class SimulationController {
    private final RepaymentSimulator simulator;
    public SimulationController(RepaymentSimulator simulator) { this.simulator = simulator; }

    @Operation(summary = "Calculate an anonymous fixed-rate repayment estimate")
    @SecurityRequirements
    @PostMapping("/api/v1/simulations/repayment")
    public ResponseEntity<SimulationDtos.Result> simulate(@Valid @RequestBody SimulationDtos.Request request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(simulator.simulate(request));
    }
}
