/**
 * Shape of a translation: the same keys as the Vietnamese source, any string as the value. Used with `satisfies` in
 * the English files, so a missing, extra or misspelled key is a type error.
 */
export type Dict<T> = { [K in keyof T]: T[K] extends string ? string : Dict<T[K]> };
