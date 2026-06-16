import { ArrayMinSize, IsArray, IsIn, IsUrl } from "class-validator";
import { WEBHOOK_EVENTS } from "../webhook-events";

// CreateWebhookEndpointDto — validation DTO pour POST /api/v1/webhooks (API-03).
//
// Validation (T-5-input) :
//  - url : @IsUrl — URL valide (http/https), rejette les strings quelconques → 400.
//  - events : @IsArray + @ArrayMinSize(1) + @IsIn(WEBHOOK_EVENTS, each) — liste non vide
//    de noms d'événements connus → 400 si vide ou inconnu.

export class CreateWebhookEndpointDto {
  @IsUrl({}, { message: "url must be a valid URL" })
  url!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...WEBHOOK_EVENTS], { each: true })
  events!: string[];
}
