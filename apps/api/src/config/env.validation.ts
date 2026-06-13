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
}).unknown(true);
