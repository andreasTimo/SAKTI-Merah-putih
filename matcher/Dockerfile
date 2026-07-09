# Build the SourceAFIS matcher (runs unit tests during package) then ship a slim JRE image.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -B dependency:go-offline || true
COPY src ./src
RUN mvn -q -B package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/matcher.jar ./matcher.jar
EXPOSE 8090
CMD ["java", "-jar", "matcher.jar"]
