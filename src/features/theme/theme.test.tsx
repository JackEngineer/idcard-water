import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';

test('defaults to following the system', () => {
  render(<ThemeSwitch/>);
  expect(screen.getByRole('radiogroup', {name: '外观'})).toBeInTheDocument();
  expect(screen.getByRole('radio', {name: '跟随系统'})).toBeChecked();
  expect(document.documentElement).not.toHaveAttribute('data-theme');
});

test('the three options set and clear the theme attribute', async () => {
  render(<ThemeSwitch/>);
  await userEvent.click(screen.getByRole('radio', {name: '深色'}));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  await userEvent.click(screen.getByRole('radio', {name: '浅色'}));
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  await userEvent.click(screen.getByRole('radio', {name: '跟随系统'}));
  expect(document.documentElement).not.toHaveAttribute('data-theme');
});

test('the choice is not remembered across mounts', async () => {
  const first = render(<ThemeSwitch/>);
  await userEvent.click(screen.getByRole('radio', {name: '深色'}));
  first.unmount();
  expect(document.documentElement).not.toHaveAttribute('data-theme');
  render(<ThemeSwitch/>);
  expect(screen.getByRole('radio', {name: '跟随系统'})).toBeChecked();
  expect(document.documentElement).not.toHaveAttribute('data-theme');
});