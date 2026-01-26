import Link from 'next/link'
import Image from 'next/image'
import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface AuthErrorPageProps {
  searchParams: Promise<{ error?: string }>
}

const errorMessages: Record<string, { title: string; message: string; canRetry: boolean }> = {
  AccessDenied: {
    title: 'Permissões Necessárias',
    message:
      'O IAra precisa de acesso ao seu canal do YouTube para funcionar. ' +
      'Por favor, autorize todas as permissões solicitadas para continuar.',
    canRetry: true,
  },
  OAuthAccountNotLinked: {
    title: 'Conta já vinculada',
    message:
      'Este email já está vinculado a outra conta. ' +
      'Tente fazer login com a conta original ou use um email diferente.',
    canRetry: true,
  },
  Callback: {
    title: 'Erro no Callback OAuth',
    message:
      'Houve um problema ao processar a resposta do Google. ' +
      'Verifique se as permissões foram concedidas e tente novamente.',
    canRetry: true,
  },
  Configuration: {
    title: 'Erro de Configuração',
    message:
      'Há um problema com a configuração de autenticação. ' +
      'Entre em contato com o suporte.',
    canRetry: false,
  },
  Default: {
    title: 'Erro de Autenticação',
    message: 'Ocorreu um erro durante a autenticação. Tente novamente.',
    canRetry: true,
  },
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { error } = await searchParams
  const errorInfo = errorMessages[error || 'Default'] || errorMessages.Default

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto">
            <Image
              src="/IAra_logo.png"
              alt="IAra Logo"
              width={80}
              height={80}
              className="rounded-2xl opacity-50"
              priority
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">{errorInfo.title}</CardTitle>
          </div>
          <CardDescription className="text-base">{errorInfo.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorInfo.canRetry && (
            <Button asChild className="w-full">
              <Link href="/login">Tentar Novamente</Link>
            </Button>
          )}
          {!errorInfo.canRetry && (
            <Button asChild variant="outline" className="w-full">
              <Link href="/">Voltar ao Início</Link>
            </Button>
          )}
          {error && (
            <p className="text-center text-xs text-muted-foreground">
              Código do erro: {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
