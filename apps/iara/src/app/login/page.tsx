import { redirect } from 'next/navigation'
import Image from 'next/image'

import { auth, signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { GoogleIcon } from '@/components/auth/google-icon'

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; expired?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Redirect if already authenticated
  const session = await auth()
  const params = await searchParams

  // Validate callbackUrl to prevent Open Redirect attacks
  // Only allow relative paths starting with /
  const rawCallbackUrl = params.callbackUrl
  const callbackUrl =
    rawCallbackUrl && rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')
      ? rawCallbackUrl
      : '/videos'

  // Show expired session message if redirected due to 401
  const showExpiredMessage = params.expired === 'true'

  // Only redirect if session exists AND has no errors
  // (e.g., UserNotFoundError when user was deleted from Firestore)
  if (session && !session.error) {
    redirect(callbackUrl)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border/50">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto">
            <Image
              src="/IAra_logo.png"
              alt="IAra Logo"
              width={120}
              height={120}
              className="rounded-2xl"
              priority
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">IAra</h1>
            <CardDescription>
              A Inteligência Artificial do PPT Não Compila
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showExpiredMessage && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Sua sessão expirou. Faça login novamente.
            </div>
          )}
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: callbackUrl })
            }}
          >
            <Button
              type="submit"
              variant="secondary"
              className="w-full gap-2 bg-white text-gray-900 hover:bg-gray-100 border border-gray-300"
            >
              <GoogleIcon />
              Entrar com Google
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            Ao entrar, você autoriza acesso ao seu canal do YouTube para gerenciar metadados de
            vídeos.
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <a href="/privacy" className="hover:text-foreground transition-colors">
              Política de Privacidade
            </a>
            {' · '}
            <a href="/terms" className="hover:text-foreground transition-colors">
              Termos de Serviço
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
