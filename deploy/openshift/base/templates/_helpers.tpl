{{- define "sovereign.labels" -}}
app.kubernetes.io/part-of: sovereign-ai-101
sovereign.ai/source: {{ .Values.source_state | quote }}
sovereign.ai/delivery: development
{{- end -}}
