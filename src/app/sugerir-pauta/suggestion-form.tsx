"use client";

import { useActionState } from "react";
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, CheckCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { submitSuggestion, type SuggestionActionResult } from "./actions";

const initialState: SuggestionActionResult = {
  success: false,
  message: "",
};

export function SuggestionForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: SuggestionActionResult, formData: FormData) => {
      return submitSuggestion(formData);
    },
    initialState
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Show success state or toast on error
  useEffect(() => {
    if (!state.timestamp) return; // Skip initial render
    if (state.success && state.message) {
      setShowSuccess(true);
      formRef.current?.reset();
    } else if (!state.success && state.message && !state.errors) {
      toast.error(state.message);
    }
  }, [state.success, state.message, state.errors, state.timestamp]);

  // Show success card after submission
  if (showSuccess) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="mb-2 text-xl font-semibold text-foreground">
          Sugestão enviada!
        </h3>
        <p className="mb-6 text-muted-foreground">
          Agradecemos sua contribuição. Nossa equipe avaliará sua sugestão em breve.
        </p>
        <Button
          variant="outline"
          onClick={() => setShowSuccess(false)}
          className="mx-auto"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Enviar outra sugestão
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form ref={formRef} action={formAction} className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Nome *</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Seu nome completo"
            required
            aria-describedby={state.errors?.name ? "name-error" : undefined}
          />
          {state.errors?.name && (
            <p id="name-error" className="text-sm text-destructive">
              {state.errors.name}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            required
            aria-describedby={state.errors?.email ? "email-error" : undefined}
          />
          {state.errors?.email && (
            <p id="email-error" className="text-sm text-destructive">
              {state.errors.email}
            </p>
          )}
        </div>

        {/* Type */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Tipo de sugestão *</legend>
          <RadioGroup name="type" required className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="pauta" id="type-pauta" />
              <Label htmlFor="type-pauta" className="cursor-pointer font-normal">
                Pauta
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="convidado" id="type-convidado" />
              <Label htmlFor="type-convidado" className="cursor-pointer font-normal">
                Convidado
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="ambos" id="type-ambos" />
              <Label htmlFor="type-ambos" className="cursor-pointer font-normal">
                Ambos
              </Label>
            </div>
          </RadioGroup>
          {state.errors?.type && (
            <p className="text-sm text-destructive">{state.errors.type}</p>
          )}
        </fieldset>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Título da sugestão *</Label>
          <Input
            id="title"
            name="title"
            type="text"
            placeholder="Ex: Inteligência Artificial na Saúde"
            required
            aria-describedby={state.errors?.title ? "title-error" : undefined}
          />
          {state.errors?.title && (
            <p id="title-error" className="text-sm text-destructive">
              {state.errors.title}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Descrição *</Label>
          <Textarea
            id="description"
            name="description"
            placeholder="Descreva sua sugestão em detalhes. Por que esse tema é interessante? Quem seria um bom convidado?"
            rows={5}
            required
            aria-describedby={
              state.errors?.description ? "description-error" : undefined
            }
          />
          {state.errors?.description && (
            <p id="description-error" className="text-sm text-destructive">
              {state.errors.description}
            </p>
          )}
        </div>

        {/* LinkedIn URL */}
        <div className="space-y-2">
          <Label htmlFor="linkedinUrl">
            LinkedIn do convidado{" "}
            <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="linkedinUrl"
            name="linkedinUrl"
            type="url"
            placeholder="https://linkedin.com/in/..."
            aria-describedby={
              state.errors?.linkedinUrl ? "linkedin-error" : undefined
            }
          />
          {state.errors?.linkedinUrl && (
            <p id="linkedin-error" className="text-sm text-destructive">
              {state.errors.linkedinUrl}
            </p>
          )}
        </div>

        {/* Submit */}
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : state.success ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Enviado!
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Enviar Sugestão
            </>
          )}
        </Button>

        {/* General error message */}
        {!state.success && state.message && state.errors && (
          <p className="text-center text-sm text-destructive">{state.message}</p>
        )}
      </form>
    </Card>
  );
}
