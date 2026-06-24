// @kessel/shared/contracts/timetrack — Contrats partagés du module time-tracking (FX-04).
//
// SOURCE DE VÉRITÉ UNIQUE : validation SIREN/SIRET côté serveur ET web, TypeScript PUR,
// AUCUN import de framework. Implémente l'algorithme de Luhn (INSEE standard) + l'exception
// réglementaire La Poste (tout SIRET 14 chiffres dont la somme des chiffres est divisible par 5).

// Longueurs légales INSEE.
const SIREN_LENGTH = 9;
const SIRET_LENGTH = 14;

// Exception La Poste (INSEE §4) : certains SIRET valides (notamment les établissements La Poste)
// n'honorent pas l'algorithme de Luhn mais leur somme de chiffres est divisible par 5.
const LA_POSTE_MULTIPLE = 5;

/**
 * Valide un SIREN (9 chiffres) ou un SIRET (14 chiffres) par l'algorithme de Luhn,
 * avec l'exception réglementaire INSEE La Poste (FX-04 : SIRET dont digitSum % 5 === 0).
 *
 * Ne nettoie JAMAIS la valeur en entrée (espaces, tirets, points -> rejet direct).
 */
export function isValidSirenSiret(value: string): boolean {
  // Garde stricte : uniquement des chiffres, longueur 9 ou 14.
  if (!/^[0-9]+$/.test(value)) return false;
  if (value.length !== SIREN_LENGTH && value.length !== SIRET_LENGTH) return false;

  return luhnOk(value) || isLaPosteException(value);
}

/** Algorithme de Luhn (INSEE) : double les chiffres aux positions paires depuis la droite,
 *  soustrait 9 si le double dépasse 9 ; valide si la somme totale % 10 === 0. */
function luhnOk(value: string): boolean {
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    const posFromRight = value.length - 1 - i;
    let digit = parseInt(value[i], 10);
    if (posFromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Exception La Poste (INSEE §4) : s'applique aux SIRET 14 chiffres dont la somme des chiffres
 *  est divisible par LA_POSTE_MULTIPLE (5). Couvre le siège ET les établissements La Poste
 *  qui échouent au Luhn pur mais respectent cette règle complémentaire. */
function isLaPosteException(value: string): boolean {
  if (value.length !== SIRET_LENGTH) return false;
  return digitSum(value) % LA_POSTE_MULTIPLE === 0;
}

/** Somme des chiffres décimaux d'une chaîne de chiffres. */
function digitSum(value: string): number {
  let sum = 0;
  for (const ch of value) {
    sum += parseInt(ch, 10);
  }
  return sum;
}
