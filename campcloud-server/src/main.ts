import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  const reflector = app.get(Reflector);
  const corsOriginRaw = process.env.CORS_ORIGIN?.trim();
  const corsOrigin =
    corsOriginRaw === '*'
      ? true
      : corsOriginRaw
        ? corsOriginRaw.split(',').map((origin) => origin.trim()).filter(Boolean)
        : ['http://127.0.0.1:5173', 'http://localhost:5173'];

  app.useLogger(logger);
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-start-byte'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor(reflector));

  if ((process.env.SWAGGER_ENABLED ?? 'true') === 'true') {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('AICampCloud API')
      .setDescription('AICampCloud MVP API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(Number(process.env.PORT ?? 3000));
  logger.log(`AICampCloud server started on port ${process.env.PORT ?? 3000}`);
}

void bootstrap();
