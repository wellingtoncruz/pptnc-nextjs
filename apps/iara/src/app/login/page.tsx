import { redirect } from 'next/navigation'
import Image from 'next/image'

import { auth, signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

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
