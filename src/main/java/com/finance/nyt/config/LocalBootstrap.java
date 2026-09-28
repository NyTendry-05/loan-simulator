package com.finance.nyt.config;

import com.finance.nyt.service.AuthService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;

@Component @RequiredArgsConstructor @ConditionalOnProperty(name = "app.auth.mode", havingValue = "local")
public class LocalBootstrap implements ApplicationRunner {
    private final AuthService auth;
    private final Environment environment;
    @Override public void run(ApplicationArguments args) {
        String email = environment.getProperty("BOOTSTRAP_ADMIN_EMAIL");
        if (email != null && !email.isBlank()) {
            String password = environment.getRequiredProperty("BOOTSTRAP_ADMIN_PASSWORD");
            String name = environment.getRequiredProperty("BOOTSTRAP_ADMIN_NAME");
            auth.bootstrap(email, name, password);
        }
    }
}

