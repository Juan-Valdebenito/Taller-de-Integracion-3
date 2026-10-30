import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { darkColors } from '../../theme';
import { Brand } from '../Brand';
import { Card } from '../Card';
import { GradientText as GradientTextWeb } from '../GradientText.web';
import { PageTitle } from '../PageTitle';

describe('Brand', () => {
  it('muestra "TransitHub" accesible y el 🚌 como decoración', async () => {
    await render(<Brand />);

    expect(screen.getByLabelText('TransitHub')).toBeTruthy();
    expect(screen.getByText('🚌', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });
});

describe('GradientText (web)', () => {
  it('usa background-clip: text con el degradado, como el frontend', async () => {
    await render(
      <GradientTextWeb style={{ fontSize: 18 }} colors={['#2b7cee', '#88b8fc']}>
        TransitHub
      </GradientTextWeb>,
    );

    expect(StyleSheet.flatten(screen.getByText('TransitHub').props.style)).toMatchObject({
      fontSize: 18,
      backgroundImage: 'linear-gradient(135deg, #2b7cee, #88b8fc)',
      backgroundClip: 'text',
      color: 'transparent',
    });
  });
});

describe('Card', () => {
  it('muestra su contenido sobre la superficie con borde', async () => {
    await render(
      <Card>
        <Text>Contenido</Text>
      </Card>,
    );

    expect(screen.getByText('Contenido')).toBeTruthy();
  });

  it('la destacada tiene el radio, el padding y la sombra de la tarjeta de login del web', async () => {
    await render(
      <Card elevated testID="tarjeta">
        <Text>Login</Text>
      </Card>,
    );

    const card = StyleSheet.flatten(screen.getByTestId('tarjeta').props.style);
    expect(card).toMatchObject({ borderRadius: 16, padding: 32, borderWidth: 1 });
    expect(card.boxShadow).toBe('0 10px 25px rgba(0, 0, 0, 0.3)');
  });
});

describe('PageTitle', () => {
  it('muestra el emoji y el título como encabezado, y la bajada', async () => {
    await render(<PageTitle emoji="📋" title="Mis Reclamos" subtitle="Consulta y registra tus reclamos" />);

    expect(screen.getByRole('header', { name: '📋 Mis Reclamos' })).toBeTruthy();
    expect(screen.getByText('Consulta y registra tus reclamos')).toBeTruthy();
  });

  it('sin emoji ni bajada muestra solo el título', async () => {
    await render(<PageTitle title="Rutas" />);

    expect(screen.getByRole('header', { name: 'Rutas' })).toBeTruthy();
  });
});

it('los colores oscuros siguen siendo los del web (base de las tarjetas)', () => {
  expect([darkColors.surface, darkColors.border]).toEqual(['#191d24', '#373d49']);
});
