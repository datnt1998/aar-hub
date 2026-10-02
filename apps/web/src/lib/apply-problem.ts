import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { bodyFieldPath, isProblem } from '../api/problem';
import { fieldMessage, problemMessage, type ProblemMessages } from './messages';

/**
 * Shows an API error on a react-hook-form form: each `errors[].pointer` into the request body that names one of
 * `fields` goes on that field (the first one gets focus); everything else goes to `root.server` as one
 * Vietnamese message. Render `formState.errors.root?.server?.message` in a FormAlert.
 */
export function applyProblem<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly FieldPath<T>[],
  messages: ProblemMessages = {},
): void {
  let matched = 0;
  let unmatched = 0;
  if (isProblem(error)) {
    for (const fieldError of error.errors ?? []) {
      const path = bodyFieldPath(fieldError.pointer);
      const field = fields.find((name) => name === path);
      if (field === undefined) {
        unmatched += 1;
        continue;
      }
      setError(field, { type: 'server', message: fieldMessage(fieldError.code) }, { shouldFocus: matched === 0 });
      matched += 1;
    }
  }
  if (matched === 0 || unmatched > 0) {
    setError('root.server', { type: 'server', message: problemMessage(error, messages) });
  }
}
