import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { SelectField } from '../SelectField';

const OPTIONS = [
  { value: 'PASSENGER', label: 'Pasajero Frecuente' },
  { value: 'COMPANY', label: 'Operador / Empresa de Buses' },
] as const;

type Role = (typeof OPTIONS)[number]['value'];

function Harness({ onChange }: { onChange?: (value: Role) => void }) {
  const [value, setValue] = useState<Role>('PASSENGER');
  return (
    <SelectField
      label="Tipo de Usuario"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('SelectField', () => {
  it('muestra la etiqueta y la opción elegida, como el <select> del web', async () => {
    await render(<Harness />);

    expect(screen.getByText('Tipo de Usuario')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tipo de Usuario: Pasajero Frecuente' })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('al tocarlo abre las opciones con la elegida marcada', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByRole('button', { name: 'Tipo de Usuario: Pasajero Frecuente' }));

    expect(screen.getByRole('radio', { name: 'Pasajero Frecuente' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Operador / Empresa de Buses' }).props.accessibilityState.checked).toBe(false);
  });

  it('elegir una opción la aplica y cierra la lista', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Tipo de Usuario: Pasajero Frecuente' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Operador / Empresa de Buses' }));

    expect(onChange).toHaveBeenCalledWith('COMPANY');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tipo de Usuario: Operador / Empresa de Buses' })).toBeTruthy();
  });

  it('tocar fuera de la lista la cierra sin cambiar la opción', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Tipo de Usuario: Pasajero Frecuente' }));
    await fireEvent.press(screen.getByLabelText('Cerrar la lista'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('una opción deshabilitada se ve pero no se puede elegir', async () => {
    const onChange = jest.fn();
    await render(
      <SelectField
        label="Unidad asignada"
        value="a"
        options={[
          { value: 'a', label: 'BGPK-45 · Disponible' },
          { value: 'm', label: 'FGRT-33 · Mantenimiento', disabled: true },
        ]}
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Unidad asignada: BGPK-45 · Disponible' }));

    const disabled = screen.getByRole('radio', { name: 'FGRT-33 · Mantenimiento' });
    expect(disabled).toBeDisabled();
    await fireEvent.press(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sin opciones no falla: se muestra vacío (p. ej. mientras se cierra una ventana)', async () => {
    await render(<SelectField label="Nuevo estado" value="PENDING" options={[]} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Nuevo estado: ' })).toBeTruthy();
  });
});
