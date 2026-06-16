import Joi from "joi";

// Validation des variables d'environnement au boot (Pitfall 3/4). ConfigModule.forRoot l'exécute à
// l'instanciation d'AppModule -> erreur AVANT app.listen() si STRIPE_SECRET_KEY absent (T-1-env).
// allowUnknown laissé par défaut : on ne valide QUE ce qui nous concerne, sans bloquer les autres env.
export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  BETTER_AUTH_SECRET: Joi.string().optional(),
  STRIPE_SECRET_KEY: Joi.string().required().messages({
    "any.required": "STRIPE_SECRET_KEY is required — set it in your .env",
    "string.empty": "STRIPE_SECRET_KEY cannot be empty",
  }),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
  PORTAL_JWT_SECRET: Joi.string().min(32).required().messages({
    "any.required": "PORTAL_JWT_SECRET is required — set it in your .env (>= 32 chars)",
    "string.min": "PORTAL_JWT_SECRET must be at least 32 characters",
  }),
  PORTAL_APP_URL: Joi.string().uri().default("http://localhost:5174"),
  WEBHOOK_ENCRYPTION_KEY: Joi.string().length(64).required().messages({
    "any.required": "WEBHOOK_ENCRYPTION_KEY is required — 64 hex chars (32 bytes)",
    "string.length": "WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex characters",
  }),
  API_RATE_LIMIT_PER_MIN: Joi.number().integer().min(1).default(100),
}).unknown(true);
