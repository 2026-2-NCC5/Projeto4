"""Validação do contexto acadêmico e detecção determinística de situações.

Etapas:
1. ``validate_context`` identifica registros inconsistentes (SCENARIO-007) e
   devolve um contexto "limpo" apenas com registros confiáveis.
2. ``detect_findings`` aplica as regras configuradas sobre o contexto limpo
   (pendências, frequência, desempenho) produzindo ``Finding`` com evidências.

Nenhuma decisão administrativa é tomada aqui: as regras apenas descrevem
situações e apontam a necessidade de validação humana quando aplicável.
"""

from __future__ import annotations

from datetime import date

from app.agent.config import AgentConfig, RuleConfig
from app.agent.models import (
    AcademicContext,
    Assessment,
    AttendanceRecord,
    Evidence,
    Finding,
    Inconsistency,
    PendingItem,
    Subject,
)

OPEN_PENDING_STATUSES = ("pending", "overdue")


def _round(value: float) -> float:
    return round(value + 1e-9, 2)


def _subject_label(subject: Subject | None, subject_id: str | None) -> str:
    if subject is not None:
        return subject.name
    return subject_id or "disciplina não identificada"


# ---------------------------------------------------------------------------
# 1. Validação de consistência
# ---------------------------------------------------------------------------


def validate_context(
    context: AcademicContext, reference_date: date
) -> tuple[AcademicContext, tuple[Inconsistency, ...]]:
    """Separa registros inconsistentes e devolve (contexto_limpo, inconsistências)."""

    subjects_by_id = {subject.id: subject for subject in context.subjects}
    known_subjects = bool(subjects_by_id)
    inconsistencies: list[Inconsistency] = []

    def unknown_subject(subject_id: str | None) -> bool:
        return known_subjects and subject_id is not None and subject_id not in subjects_by_id

    # Pendências ---------------------------------------------------------
    clean_pending: list[PendingItem] = []
    seen_pending: set[str] = set()
    for item in context.pending_items:
        ref = f"pending_items#{item.id}"
        if item.id in seen_pending:
            inconsistencies.append(
                Inconsistency(
                    "duplicate_pending_item", f"A pendência {item.id} aparece mais de uma vez.", ref, item.subject_id
                )
            )
            continue
        seen_pending.add(item.id)
        if unknown_subject(item.subject_id):
            inconsistencies.append(
                Inconsistency(
                    "pending_item_unknown_subject",
                    f"A pendência '{item.description or item.id}' referencia uma disciplina sem matrícula ativa.",
                    ref,
                    item.subject_id,
                )
            )
            continue
        clean_pending.append(item)

    # Frequência ---------------------------------------------------------
    clean_attendance: list[AttendanceRecord] = []
    for record in context.attendance:
        ref = f"attendance#{record.subject_id}"
        label = _subject_label(subjects_by_id.get(record.subject_id), record.subject_id)
        if record.total_classes < 0 or record.attended_classes < 0:
            inconsistencies.append(
                Inconsistency(
                    "attendance_negative",
                    f"O registro de frequência de {label} possui valores negativos.",
                    ref,
                    record.subject_id,
                )
            )
            continue
        if record.attended_classes > record.total_classes:
            inconsistencies.append(
                Inconsistency(
                    "attendance_exceeds_classes",
                    f"O registro de frequência de {label} possui mais presenças "
                    f"({record.attended_classes}) do que aulas ({record.total_classes}).",
                    ref,
                    record.subject_id,
                )
            )
            continue
        if unknown_subject(record.subject_id):
            inconsistencies.append(
                Inconsistency(
                    "attendance_unknown_subject",
                    f"Existe frequência registrada para uma disciplina sem matrícula ativa ({record.subject_id}).",
                    ref,
                    record.subject_id,
                )
            )
            continue
        clean_attendance.append(record)

    # Avaliações ---------------------------------------------------------
    clean_assessments: list[Assessment] = []
    seen_assessments: set[str] = set()
    for assessment in context.assessments:
        ref = f"assessments#{assessment.id}"
        label = _subject_label(subjects_by_id.get(assessment.subject_id), assessment.subject_id)
        if assessment.id in seen_assessments:
            inconsistencies.append(
                Inconsistency(
                    "duplicate_assessment",
                    f"A avaliação {assessment.id} aparece mais de uma vez.",
                    ref,
                    assessment.subject_id,
                )
            )
            continue
        seen_assessments.add(assessment.id)
        if assessment.max_score <= 0:
            inconsistencies.append(
                Inconsistency(
                    "assessment_invalid_max_score",
                    f"A avaliação '{assessment.title}' de {label} possui pontuação máxima inválida.",
                    ref,
                    assessment.subject_id,
                )
            )
            continue
        if assessment.score is not None and (assessment.score < 0 or assessment.score > assessment.max_score):
            inconsistencies.append(
                Inconsistency(
                    "assessment_score_out_of_range",
                    f"A avaliação '{assessment.title}' de {label} possui nota fora do intervalo permitido.",
                    ref,
                    assessment.subject_id,
                )
            )
            continue
        if (
            assessment.score is not None
            and assessment.applied_at is not None
            and assessment.applied_at > reference_date
        ):
            inconsistencies.append(
                Inconsistency(
                    "assessment_future_score",
                    f"A avaliação '{assessment.title}' de {label} possui nota registrada "
                    f"com data futura ({assessment.applied_at.isoformat()}).",
                    ref,
                    assessment.subject_id,
                )
            )
            continue
        if unknown_subject(assessment.subject_id):
            inconsistencies.append(
                Inconsistency(
                    "assessment_unknown_subject",
                    f"A avaliação '{assessment.title}' referencia uma disciplina sem matrícula ativa.",
                    ref,
                    assessment.subject_id,
                )
            )
            continue
        clean_assessments.append(assessment)

    clean = AcademicContext(
        subjects=context.subjects,
        pending_items=tuple(clean_pending),
        attendance=tuple(clean_attendance),
        assessments=tuple(clean_assessments),
    )
    return clean, tuple(inconsistencies)


# ---------------------------------------------------------------------------
# 2. Regras determinísticas
# ---------------------------------------------------------------------------


def _pending_finding(context: AcademicContext, reference_date: date, config: AgentConfig) -> Finding | None:
    rule = config.rule("pending_activity")
    if not rule.enabled:
        return None

    open_items = [item for item in context.pending_items if item.status in OPEN_PENDING_STATUSES]
    if not open_items:
        return None

    subjects_by_id = {subject.id: subject for subject in context.subjects}
    due_soon_days = config.thresholds.pending.due_soon_days

    def urgency(item: PendingItem) -> tuple[int, str]:
        if item.due_date is None:
            return (10_000, item.id)
        return ((item.due_date - reference_date).days, item.id)

    ordered = sorted(open_items, key=urgency)
    evidence: list[Evidence] = [
        Evidence(
            "pending_item",
            "Foi identificada uma atividade pendente."
            if len(ordered) == 1
            else f"Foram identificadas {len(ordered)} atividades pendentes.",
            "pending_items",
        )
    ]
    urgent = False
    for item in ordered:
        label = _subject_label(subjects_by_id.get(item.subject_id), item.subject_id)
        description = item.description or item.type
        if item.due_date is None:
            detail = f"{label}: {description} (sem prazo registrado)."
        else:
            days = (item.due_date - reference_date).days
            if days < 0 or item.status == "overdue":
                detail = f"{label}: {description} (prazo {item.due_date.isoformat()}, vencido)."
                urgent = True
            elif days <= due_soon_days:
                plural = "s" if days != 1 else ""
                detail = f"{label}: {description} (prazo {item.due_date.isoformat()}, em {days} dia{plural})."
                urgent = True
            else:
                detail = f"{label}: {description} (prazo {item.due_date.isoformat()})."
        evidence.append(Evidence("pending_item", detail, f"pending_items#{item.id}"))

    first = ordered[0]
    return Finding(
        type=rule.type,
        subject_id=first.subject_id,
        subject_name=_subject_label(subjects_by_id.get(first.subject_id), first.subject_id)
        if first.subject_id
        else None,
        evidence=tuple(evidence),
        confidence=_round(rule.base_confidence),
        priority=rule.priority if urgent else rule.priority + 1,
        message_params={"count": len(ordered)},
    )


def _attendance_findings(context: AcademicContext, config: AgentConfig) -> list[Finding]:
    thresholds = config.thresholds.attendance
    subjects_by_id = {subject.id: subject for subject in context.subjects}
    findings: list[Finding] = []

    for record in sorted(context.attendance, key=lambda item: item.subject_id):
        rate = record.rate
        if rate is None:
            continue
        rule: RuleConfig | None
        if rate < thresholds.critical_rate:
            rule = config.rule("attendance_critical")
        elif rate < thresholds.attention_rate:
            rule = config.rule("attendance_attention")
        else:
            rule = None
        if rule is None or not rule.enabled:
            continue

        label = _subject_label(subjects_by_id.get(record.subject_id), record.subject_id)
        percent = round(rate * 100)
        threshold_percent = round(
            (thresholds.critical_rate if rule.type == "attendance_critical" else thresholds.attention_rate) * 100
        )
        evidence = [
            Evidence(
                "attendance",
                f"Sua frequência registrada em {label} é de {percent}% "
                f"({record.attended_classes} de {record.total_classes} aulas).",
                f"attendance#{record.subject_id}",
            ),
            Evidence(
                "threshold",
                (
                    f"O mínimo institucional de referência é {threshold_percent}%."
                    if rule.type == "attendance_critical"
                    else f"O limiar de atenção configurado é {threshold_percent}%."
                ),
                "thresholds.yaml#attendance."
                + ("critical_rate" if rule.type == "attendance_critical" else "attention_rate"),
            ),
        ]
        confidence = rule.base_confidence
        if record.total_classes < thresholds.minimum_classes_for_full_confidence:
            confidence -= rule.small_sample_penalty
            evidence.append(
                Evidence(
                    "sample_size",
                    f"Poucas aulas registradas ({record.total_classes}); a confiança desta análise foi reduzida.",
                    "thresholds.yaml#attendance.minimum_classes_for_full_confidence",
                )
            )
        findings.append(
            Finding(
                type=rule.type,
                subject_id=record.subject_id,
                subject_name=label,
                evidence=tuple(evidence),
                confidence=_round(max(0.0, confidence)),
                priority=rule.priority,
                message_params={"subject": label, "rate": percent},
            )
        )
    return findings


def _performance_findings(context: AcademicContext, config: AgentConfig) -> list[Finding]:
    rule = config.rule("performance_attention")
    if not rule.enabled:
        return []
    thresholds = config.thresholds.performance
    subjects_by_id = {subject.id: subject for subject in context.subjects}

    grouped: dict[str, list[Assessment]] = {}
    for assessment in context.assessments:
        if assessment.score is None:
            continue
        grouped.setdefault(assessment.subject_id, []).append(assessment)

    findings: list[Finding] = []
    for subject_id in sorted(grouped):
        graded = grouped[subject_id]
        if len(graded) < thresholds.minimum_assessments:
            continue
        total_max = sum(item.max_score for item in graded)
        total_score = sum(item.score for item in graded if item.score is not None)
        ratio = total_score / total_max if total_max > 0 else None
        if ratio is None or ratio >= thresholds.attention_ratio:
            continue

        label = _subject_label(subjects_by_id.get(subject_id), subject_id)
        evidence = [
            Evidence(
                "assessment",
                f"Sua média registrada em {label} é {round(ratio * 10, 1):.1f} de 10 "
                f"considerando {len(graded)} avaliaç{'ões' if len(graded) != 1 else 'ão'}.",
                f"assessments#{subject_id}",
            ),
            Evidence(
                "threshold",
                f"O limiar de atenção configurado é {round(thresholds.attention_ratio * 10, 1):.1f} de 10.",
                "thresholds.yaml#performance.attention_ratio",
            ),
        ]
        for item in sorted(graded, key=lambda a: (a.applied_at or date.min, a.id)):
            evidence.append(
                Evidence("assessment", f"{item.title}: {item.score:g} de {item.max_score:g}.", f"assessments#{item.id}")
            )
        confidence = rule.base_confidence
        if len(graded) < thresholds.assessments_for_full_confidence:
            confidence -= rule.single_assessment_penalty
            evidence.append(
                Evidence(
                    "sample_size",
                    "Apenas uma avaliação foi considerada; a confiança desta análise foi reduzida.",
                    "thresholds.yaml#performance.assessments_for_full_confidence",
                )
            )
        findings.append(
            Finding(
                type=rule.type,
                subject_id=subject_id,
                subject_name=label,
                evidence=tuple(evidence),
                confidence=_round(max(0.0, confidence)),
                priority=rule.priority,
                message_params={"subject": label},
            )
        )
    return findings


def _inconsistency_finding(inconsistencies: tuple[Inconsistency, ...], config: AgentConfig) -> Finding | None:
    rule = config.rule("institutional_validation")
    if not rule.enabled or not inconsistencies:
        return None
    evidence = [Evidence("data_quality", "Os dados apresentados possuem inconsistência.", "academic_context")]
    evidence.extend(Evidence(item.kind, item.description, item.source_reference) for item in inconsistencies)
    subject_ids = {item.subject_id for item in inconsistencies if item.subject_id}
    subject_id = next(iter(subject_ids)) if len(subject_ids) == 1 else None
    return Finding(
        type=rule.type,
        subject_id=subject_id,
        subject_name=None,
        evidence=tuple(evidence),
        confidence=_round(rule.base_confidence),
        priority=rule.priority,
        message_params={"count": len(inconsistencies)},
    )


def detect_findings(
    context: AcademicContext,
    inconsistencies: tuple[Inconsistency, ...],
    reference_date: date,
    config: AgentConfig,
) -> list[Finding]:
    """Aplica todas as regras e devolve as situações detectadas (ordem determinística)."""

    findings: list[Finding] = []
    pending = _pending_finding(context, reference_date, config)
    if pending is not None:
        findings.append(pending)
    findings.extend(_attendance_findings(context, config))
    findings.extend(_performance_findings(context, config))
    inconsistency = _inconsistency_finding(inconsistencies, config)
    if inconsistency is not None:
        findings.append(inconsistency)
    findings.sort(key=lambda item: (item.priority, item.type, item.subject_name or "", item.subject_id or ""))
    return findings
