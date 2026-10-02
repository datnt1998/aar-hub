import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import type { Problem } from '../api/problem';
import { FormAlert } from '../ui/form-alert';
import { TextField } from '../ui/text-field';
import { applyProblem } from './apply-problem';

interface Values {
  name: string;
  owner: { email: string };
}

/** A form that fails every submit with `error`, the way a screen handles a failed mutation. */
function FailingForm({ error }: { error: unknown }) {
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    defaultValues: { name: '', owner: { email: '' } },
  });
  const onSubmit = handleSubmit(() =>
    applyProblem(error, setError, ['name', 'owner.email'], { PARTNER_TAKEN: 'Đối tác đã có chủ sở hữu.' }),
  );
  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <FormAlert message={formState.errors.root?.server?.message} />
      <TextField label="Tên" error={formState.errors.name?.message} {...register('name')} />
      <TextField label="Email chủ sở hữu" error={formState.errors.owner?.email?.message} {...register('owner.email')} />
      <button type="submit">Gửi</button>
    </form>
  );
}

const validation = (errors: Problem['errors']): Problem => ({
  type: 'about:blank',
  title: 'Bad Request',
  status: 400,
  code: 'VALIDATION_FAILED',
  instance: '/api/partners',
  errors,
});

async function submit(error: unknown) {
  const user = userEvent.setup();
  render(<FailingForm error={error} />);
  await user.click(screen.getByRole('button', { name: 'Gửi' }));
}

describe('applyProblem', () => {
  it('puts body pointer errors on their fields, marks them invalid and focuses the first', async () => {
    await submit(
      validation([
        { pointer: '/body/owner/email', code: 'invalid_format', detail: 'Invalid email address' },
        { pointer: '/body/name', code: 'too_small', detail: 'Too small' },
      ]),
    );
    const email = screen.getByLabelText('Email chủ sở hữu');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Sai định dạng.');
    expect(email).toHaveFocus();
    expect(screen.getByLabelText('Tên')).toHaveAccessibleDescription('Giá trị quá ngắn hoặc quá nhỏ.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a form alert when a pointer names no field of the form', async () => {
    await submit(
      validation([
        { pointer: '/body/name', code: 'too_small', detail: 'Too small' },
        { pointer: '/query/page', code: 'invalid_type', detail: 'Expected number' },
      ]),
    );
    expect(screen.getByLabelText('Tên')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.');
  });

  it('shows the screen message of a business error code', async () => {
    await submit({ type: 'about:blank', title: 'Conflict', status: 409, code: 'PARTNER_TAKEN', instance: '/api/x' });
    expect(screen.getByRole('alert')).toHaveTextContent('Đối tác đã có chủ sở hữu.');
  });

  it('shows a connection message when the request never reached the API', async () => {
    await submit(new TypeError('Failed to fetch'));
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được máy chủ. Vui lòng thử lại.');
  });

  it('does not blame the connection for an error that is not a failed request', async () => {
    await submit(new SyntaxError('Unexpected token < in JSON'));
    expect(screen.getByRole('alert')).toHaveTextContent('Đã có lỗi không mong muốn. Vui lòng thử lại.');
  });
});
