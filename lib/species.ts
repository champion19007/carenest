export const PET_SPECIES=['dog','cat','rabbit','bird','cattle','fish','other'] as const
export type PetSpecies=typeof PET_SPECIES[number]
export const isPetSpecies=(value:unknown):value is PetSpecies=>PET_SPECIES.some(species=>species===value)
