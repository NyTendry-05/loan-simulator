FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw
COPY src src
RUN ./mvnw -B verify

FROM eclipse-temurin:21-jre-jammy
RUN groupadd --system app && useradd --system --gid app --home /app app
WORKDIR /app
COPY --from=build /app/target/nyt-0.1.0.jar app.jar
COPY deploy/render/start-api.sh start-api.sh
USER app
EXPOSE 10000
ENTRYPOINT ["sh", "/app/start-api.sh"]
