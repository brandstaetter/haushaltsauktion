/**
 * Fairness-Transparenz (§32): "Warum wurde mir diese Aufgabe zugewiesen?"
 *
 * Liest den bei der Zuweisung gespeicherten `selectionTrace` über
 * `GET /assignments/:id/explain` — die Erklärung bleibt also auch dann
 * wahr, wenn sich die Gewichtungsregeln später ändern. Nur bei
 * `AssignmentKind === 'RANDOM'` sinnvoll; für freiwillige Übernahmen gibt
 * es keinen `selectionTrace` und die Anfrage schlägt serverseitig mit
 * `NOT_RANDOM_ASSIGNMENT` fehl (§6.10) — der Aufrufer zeigt diese
 * Komponente deshalb nur für zufällige Zuweisungen an.
 */

import { useState } from 'react';
import { useAssignmentExplanation } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../Button/Button';
import { Sheet } from '../Sheet/Sheet';
import { formatNumber, interpolate } from '../../utils/format';
import styles from './AssignmentExplanation.module.css';

export function AssignmentExplanation({ assignmentId }: { assignmentId: string }) {
  const { de } = useStrings();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useAssignmentExplanation(assignmentId);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {de.fairness.trigger}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={de.fairness.title}>
        {isLoading && <p>{de.fairness.loading}</p>}
        {isError && <p role="alert">{de.error.loadFailed}</p>}
        {data && (
          <div className={styles.content}>
            <p className={styles.intro}>
              {interpolate(de.fairness.availableCount, { n: data.eligibleCount })}
            </p>
            <p className={styles.strategyNote}>{de.fairness.strategies[data.strategy]}</p>

            {data.constraintsRelaxed.length > 0 && (
              <p className={styles.relaxedNote} role="note">
                {data.constraintsRelaxed
                  .map((r) =>
                    interpolate(de.fairness.relaxedNote, {
                      constraint: de.fairness.constraints[r.constraint],
                    }),
                  )
                  .join(' ')}
              </p>
            )}

            <h3 className={styles.weightsHeading}>{de.fairness.weightsHeading}</h3>
            <ul className={styles.candidateList}>
              {data.candidates.map((c) => (
                <li key={c.memberId} className={c.selected ? styles.selected : undefined}>
                  <span className={styles.name}>{c.displayName}</span>
                  {!c.included && c.exclusionReason && (
                    <span className={styles.excluded}>
                      {interpolate(de.fairness.excludedLabel, {
                        reason: de.fairness.reasons[c.exclusionReason],
                      })}
                    </span>
                  )}
                  {c.included && c.weight !== null && (
                    <span className={styles.weight}>
                      {interpolate(de.fairness.weight, { value: formatNumber(c.weight) })}
                    </span>
                  )}
                  {/* Intake "task-role-based-eligibility-and-preferred-assignee":
                      only shown when the preference actually raised this
                      candidate's weight, not merely whenever they're on the
                      list — a stale/zero term must not claim credit. */}
                  {c.included && (c.weightTerms?.['preferredTerm'] ?? 0) > 0 && (
                    <span className={styles.weight}>{de.fairness.preferredBadge}</span>
                  )}
                  {c.selected && <span className={styles.selectedTag}>{de.fairness.selected}</span>}
                </li>
              ))}
            </ul>

            <p className={styles.footer}>{de.fairness.closing}</p>
          </div>
        )}
      </Sheet>
    </>
  );
}
