"use client";

import { useActionState } from "react";
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, CheckCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContact, type ContactActionResult } from "./actions";

const initialState: ContactActionResult = {
  success: false,
  message: "",
};

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: ContactActionResult, formData: FormData) => {
      return submitContact(formData);
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
          Mensagem enviada!
        </h3>
        <p className="mb-6 text-muted-foreground">
          Agradecemos seu contato. Responderemos em breve.
        </p>
        <Button
          variant="outline"
          onClick={() => setShowSuccess(false)}
          className="mx-auto"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Enviar outra mensagem
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
            placeholder="Seu nome"
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

        {/* Subject */}
        <div className="space-y-2">
          <Label htmlFor="subject">Assunto *</Label>
          <Input
            id="subject"
            name="subject"
            type="text"
            placeholder="Assunto da mensagem"
            required
            aria-describedby={
              state.errors?.subject ? "subject-error" : undefined
            }
          />
          {state.errors?.subject && (
            <p id="subject-error" className="text-sm text-destructive">
              {state.errors.subject}
            </p>
          )}
        </div>

        {/* Message */}
        <div className="space-y-2">
          <Label htmlFor="message">Mensagem *</Label>
          <Textarea
            id="message"
            name="message"
            placeholder="Escreva sua mensagem aqui..."
            rows={5}
            required
            aria-describedby={
              state.errors?.message ? "message-error" : undefined
            }
          />
          {state.errors?.message && (
            <p id="message-error" className="text-sm text-destructive">
              {state.errors.message}
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
              Enviar Mensagem
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
