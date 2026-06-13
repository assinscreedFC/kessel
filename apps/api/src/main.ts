import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// Bootstrap NestJS — Better Auth EXIGE bodyParser:false (Pitfall 2 / T-1-09) :
// Better Auth consomme le raw body des routes auth ; un body-parser global le casserait.
// Le module @thallesp/nestjs-better-auth réinstalle ses propres parsers sur les routes non-auth.
export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ValidationPipe GLOBAL (Pitfall 3) — sans lui, les décorateurs class-validator des DTO sont
  // décoratifs et ne valident RIEN (un amount: -5 passerait). Requis pour CRM-01/02 (V5 Input Validation).
  //   whitelist: true   -> strip les propriétés non décorées (anti-overposting).
  //   transform: true    -> instancie le DTO (plainToInstance via class-transformer) + coerce les types
  //                         (ex: query string -> enum), nécessaire pour que @IsEnum/@IsNumber s'appliquent.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  return app;
}

// Démarrage seulement si exécuté directement (pas à l'import en test).
if (process.argv[1] && process.argv[1].includes("main")) {
  bootstrap().then((app) => {
    const url = app.getHttpServer().address();
    console.log(`Kessel API listening on`, url);
  });
}
