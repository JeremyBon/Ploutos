import { useState, useCallback, useMemo } from "react";

/**
 * Deep equality comparison for form values
 * Handles primitives, arrays, and nested objects
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
    }

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);

    if (aKeys.length !== bKeys.length) return false;

    return aKeys.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }

  return false;
}

interface UseFormDirtyReturn<T> {
  /** The current form values */
  formValues: T;
  /** The original values for comparison */
  originalValues: T | null;
  /** Whether any values have changed from original */
  isDirty: boolean;
  /** Check if a specific field has changed */
  isFieldDirty: (field: keyof T) => boolean;
  /** Update form values */
  setFormValues: (values: T | ((prev: T) => T)) => void;
  /** Set the original values (call when opening edit mode) */
  setOriginalValues: (values: T) => void;
  /** Reset form to original values */
  resetForm: () => void;
  /** Clear both form and original values */
  clearForm: (defaultValues: T) => void;
  /** Mark current values as pristine (call after successful save) */
  markAsPristine: () => void;
}

export function useFormDirty<T>(defaultValues: T): UseFormDirtyReturn<T> {
  const [formValues, setFormValuesInternal] = useState<T>(defaultValues);
  const [originalValues, setOriginalValuesInternal] = useState<T | null>(null);

  const isDirty = useMemo(() => {
    if (originalValues === null) return false;
    return !deepEqual(formValues, originalValues);
  }, [formValues, originalValues]);

  const isFieldDirty = useCallback(
    (field: keyof T): boolean => {
      if (originalValues === null) return false;
      return !deepEqual(formValues[field], (originalValues as T)[field]);
    },
    [formValues, originalValues]
  );

  const setFormValues = useCallback((values: T | ((prev: T) => T)) => {
    setFormValuesInternal((prev) => {
      const next =
        typeof values === "function" ? (values as (p: T) => T)(prev) : values;
      return deepEqual(prev, next) ? prev : next;
    });
  }, []);

  const setOriginalValues = useCallback((values: T) => {
    const copy = structuredClone(values);
    setOriginalValuesInternal(copy);
    setFormValuesInternal(copy);
  }, []);

  const resetForm = useCallback(() => {
    if (originalValues !== null) {
      setFormValuesInternal(structuredClone(originalValues));
    }
  }, [originalValues]);

  const clearForm = useCallback((defaultVals: T) => {
    setFormValuesInternal(defaultVals);
    setOriginalValuesInternal(null);
  }, []);

  const markAsPristine = useCallback(() => {
    setOriginalValuesInternal(structuredClone(formValues));
  }, [formValues]);

  return {
    formValues,
    originalValues,
    isDirty,
    isFieldDirty,
    setFormValues,
    setOriginalValues,
    resetForm,
    clearForm,
    markAsPristine,
  };
}
