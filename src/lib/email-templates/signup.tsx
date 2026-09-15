import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface SignupEmailProps {
  siteName: string
  token: string
}

export const SignupEmail = ({ siteName, token }: SignupEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je inlogcode voor {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Je inlogcode</Heading>
        <Text style={text}>
          Je inlogcode voor {siteName} is:
        </Text>
        <Text style={code}>{token}</Text>
        <Text style={text}>
          Vul deze code in op het inlogscherm. De code is beperkt geldig.
        </Text>
        <Text style={footer}>
          Heb je zelf niet om deze code gevraagd? Dan kun je deze e-mail negeren.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0B2545',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const code = {
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  color: '#0B2545',
  backgroundColor: '#F1F5F9',
  borderRadius: '8px',
  padding: '16px 20px',
  textAlign: 'center' as const,
  margin: '0 0 25px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
