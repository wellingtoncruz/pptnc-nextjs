/**
 * Terms of Service — Public Page (Server Component)
 *
 * Public route: /terms. No auth required (excluded from the proxy matcher).
 * Generic, common-practice terms of service for a web-based application.
 */

import type { Metadata } from 'next'

import { LegalPage, Section, Paragraph, List } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Termos de Serviço · IAra',
  description: 'Termos de Serviço da plataforma IAra.',
}

const LAST_UPDATED = '18 de junho de 2026'

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Termos de Serviço" lastUpdated={LAST_UPDATED}>
      <Section title="1. Aceitação dos termos">
        <Paragraph>
          Estes Termos de Serviço (&quot;Termos&quot;) regem o seu acesso e uso da
          plataforma IAra (&quot;IAra&quot;, &quot;serviço&quot;, &quot;nós&quot;). Ao
          acessar ou utilizar o serviço, você declara que leu, compreendeu e concorda em
          ficar vinculado a estes Termos e à nossa Política de Privacidade. Caso não
          concorde, não utilize o serviço.
        </Paragraph>
      </Section>

      <Section title="2. Descrição do serviço">
        <Paragraph>
          A IAra é uma aplicação web que oferece funcionalidades de produtividade e
          automação. O serviço pode evoluir ao longo do tempo, e podemos adicionar,
          modificar ou descontinuar recursos a nosso critério, com ou sem aviso prévio.
        </Paragraph>
      </Section>

      <Section title="3. Elegibilidade e contas">
        <Paragraph>
          Para usar o serviço, você deve ter capacidade legal para celebrar um contrato
          vinculante. Você é responsável por manter a confidencialidade das credenciais de
          acesso à sua conta e por todas as atividades realizadas sob ela. Notifique-nos
          imediatamente sobre qualquer uso não autorizado.
        </Paragraph>
      </Section>

      <Section title="4. Uso aceitável">
        <Paragraph>Ao utilizar o serviço, você concorda em não:</Paragraph>
        <List
          items={[
            'Violar qualquer lei, regulamento ou direito de terceiros;',
            'Acessar áreas, sistemas ou dados sem autorização;',
            'Interferir, sobrecarregar ou comprometer a integridade ou o desempenho do serviço;',
            'Realizar engenharia reversa, descompilar ou tentar extrair o código-fonte, salvo quando permitido por lei;',
            'Utilizar o serviço para distribuir conteúdo ilegal, ofensivo, fraudulento ou malicioso;',
            'Usar meios automatizados não autorizados para acessar o serviço ou coletar dados.',
          ]}
        />
      </Section>

      <Section title="5. Conteúdo do usuário">
        <Paragraph>
          Você mantém a titularidade do conteúdo que fornece ao serviço. Ao enviar
          conteúdo, você concede à IAra uma licença limitada, não exclusiva e revogável
          para processar e armazenar esse conteúdo exclusivamente para operar e fornecer o
          serviço a você. Você é o único responsável pelo conteúdo que fornece e por
          garantir que possui os direitos necessários sobre ele.
        </Paragraph>
      </Section>

      <Section title="6. Propriedade intelectual">
        <Paragraph>
          O serviço, incluindo software, design, marcas, logotipos e demais conteúdos de
          nossa titularidade, é protegido por leis de propriedade intelectual e permanece
          de propriedade da IAra ou de seus licenciadores. Estes Termos não concedem a
          você qualquer direito sobre essa propriedade, exceto a licença limitada de uso
          do serviço aqui descrita.
        </Paragraph>
      </Section>

      <Section title="7. Serviços de terceiros">
        <Paragraph>
          O serviço pode integrar-se a plataformas e APIs de terceiros que você autoriza.
          O uso desses serviços está sujeito aos termos e políticas dos respectivos
          provedores. Não somos responsáveis pela disponibilidade, conteúdo ou práticas de
          serviços de terceiros.
        </Paragraph>
      </Section>

      <Section title="8. Isenção de garantias">
        <Paragraph>
          O serviço é fornecido &quot;no estado em que se encontra&quot; e &quot;conforme
          disponível&quot;, sem garantias de qualquer tipo, expressas ou implícitas,
          incluindo, sem limitação, garantias de comercialização, adequação a uma
          finalidade específica e não violação. Não garantimos que o serviço será
          ininterrupto, livre de erros ou totalmente seguro.
        </Paragraph>
      </Section>

      <Section title="9. Limitação de responsabilidade">
        <Paragraph>
          Na máxima extensão permitida por lei, a IAra não será responsável por quaisquer
          danos indiretos, incidentais, especiais, consequenciais ou punitivos, nem por
          perda de lucros, dados ou oportunidades, decorrentes do uso ou da impossibilidade
          de uso do serviço, ainda que avisada da possibilidade de tais danos.
        </Paragraph>
      </Section>

      <Section title="10. Indenização">
        <Paragraph>
          Você concorda em indenizar e isentar a IAra de quaisquer reclamações, perdas,
          responsabilidades e despesas (incluindo honorários advocatícios) decorrentes do
          seu uso do serviço ou da violação destes Termos.
        </Paragraph>
      </Section>

      <Section title="11. Suspensão e encerramento">
        <Paragraph>
          Podemos suspender ou encerrar seu acesso ao serviço, no todo ou em parte, a
          qualquer momento, caso você viole estes Termos ou para proteger a segurança e a
          integridade do serviço. Você pode encerrar sua conta a qualquer momento deixando
          de utilizar o serviço e revogando as autorizações concedidas.
        </Paragraph>
      </Section>

      <Section title="12. Alterações nos termos">
        <Paragraph>
          Podemos revisar estes Termos periodicamente. Quando o fizermos, atualizaremos a
          data de &quot;Última atualização&quot; no topo desta página. O uso contínuo do
          serviço após a entrada em vigor das alterações constitui aceitação dos Termos
          revisados.
        </Paragraph>
      </Section>

      <Section title="13. Legislação aplicável">
        <Paragraph>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Quaisquer
          disputas decorrentes destes Termos serão submetidas ao foro competente, salvo
          disposição legal em contrário.
        </Paragraph>
      </Section>

      <Section title="14. Contato">
        <Paragraph>
          Em caso de dúvidas sobre estes Termos de Serviço, entre em contato pelo e-mail{' '}
          <a
            href="mailto:contato@pptnaocompila.com.br"
            className="text-primary underline underline-offset-2"
          >
            contato@pptnaocompila.com.br
          </a>
          .
        </Paragraph>
      </Section>
    </LegalPage>
  )
}
