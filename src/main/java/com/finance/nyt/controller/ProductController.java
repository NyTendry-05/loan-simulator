package com.finance.nyt.controller;

import java.net.URI;
import java.util.UUID;
import com.finance.nyt.dto.*;
import com.finance.nyt.service.ProductService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {
    private final ProductService products;
    @GetMapping("/{id}")
    public ApiViews.Product get(@PathVariable UUID id) { return products.get(id); }
    @GetMapping
    public ApiViews.Paged<ApiViews.Product> list(@RequestParam(defaultValue = "0") @Min(0) int page,
                                                @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return products.list(page, size);
    }
    @PostMapping
    public ResponseEntity<ApiViews.Product> create(@Valid @RequestBody ProductRequest request) {
        var product = products.create(request);
        return ResponseEntity.created(URI.create("/api/v1/products/" + product.id())).body(product);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deactivate(@PathVariable UUID id) {
        products.deactivate(id);
        return ResponseEntity.noContent().build();
    }
}
