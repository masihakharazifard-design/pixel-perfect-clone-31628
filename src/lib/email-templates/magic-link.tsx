import * as React from 'react'

import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  token: string
}

export const MagicLinkEmail = ({ siteName, token }: MagicLinkEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je inlogcode voor {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Je inlogcode</Heading>
        <Text style={text}>Je inlogcode voor {siteName} is:</Text>
        <Text style={code}>{token}</Text>
        <Text style={text}>Vul deze code in op het inlogscherm. De code is kort geldig.</Text>
        <Text style={footer}>Heb je deze code niet aangevraagd? Dan kun je deze e-mail negeren.</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1A2744', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 16px' }
const code = {
  fontSize: '30px',
  fontWeight: 'bold' as const,
  letterSpacing: '6px',
  color: '#0ABFB8',
  margin: '0 0 20px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
