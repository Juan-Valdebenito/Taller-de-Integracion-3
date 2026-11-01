import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedControl } from '../SegmentedControl';

const options = [
  { value: 'a', label: 'Opción A' },
  { value: 'b', label: 'Opción B' },
] as const;

describe('SegmentedControl', () => {
  it('es un grupo de radios accesible con la opción elegida marcada', async () => {
    await render(<SegmentedControl label="Grupo" options={options} value="a" onChange={jest.fn()} />);

    // El grupo no es "accessible" (si lo fuera, iOS agruparía las opciones en un solo elemento).
    expect(screen.getByLabelText('Grupo').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Opción A' }).props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByRole('radio', { name: 'Opción B' }).props.accessibilityState).toEqual({ checked: false });
  });

  it('avisa el cambio al elegir otra opción', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl label="Grupo" options={options} value="a" onChange={onChange} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Opción B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('tocar la opción ya elegida no hace nada', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl label="Grupo" options={options} value="a" onChange={onChange} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Opción A' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
