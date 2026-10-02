import { isProblem } from '../api/problem';

/** Vietnamese text per API error `code`. Feature screens pass their own codes (`INVITATION_EXPIRED`…) on top. */
export type ProblemMessages = Readonly<Record<string, string>>;

export const NETWORK_ERROR_MESSAGE = 'Không kết nối được máy chủ. Vui lòng thử lại.';
const UNEXPECTED_ERROR_MESSAGE = 'Đã có lỗi không mong muốn. Vui lòng thử lại.';

const COMMON_MESSAGES: ProblemMessages = {
  VALIDATION_FAILED: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  BAD_REQUEST: 'Yêu cầu không hợp lệ.',
  UNAUTHORIZED: 'Phiên làm việc đã hết. Vui lòng đăng nhập lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  CONFLICT: 'Dữ liệu đã thay đổi. Vui lòng tải lại trang.',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên quá lớn.',
  TOO_MANY_REQUESTS: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
};

/**
 * Vietnamese text of any error thrown by `api`/`$api`: feature codes, then common codes, then the status class.
 * A failed `fetch` (`TypeError`) is a connection problem; any other non-Problem error is unexpected.
 */
export function problemMessage(error: unknown, messages: ProblemMessages = {}): string {
  if (!isProblem(error)) {
    return error instanceof TypeError ? NETWORK_ERROR_MESSAGE : UNEXPECTED_ERROR_MESSAGE;
  }
  const known = messages[error.code] ?? COMMON_MESSAGES[error.code];
  if (known !== undefined) {
    return known;
  }
  return error.status >= 500 ? 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.' : 'Không thực hiện được yêu cầu.';
}

const FIELD_MESSAGES: ProblemMessages = {
  invalid_type: 'Giá trị không hợp lệ.',
  invalid_format: 'Sai định dạng.',
  invalid_value: 'Giá trị không được chấp nhận.',
  too_small: 'Giá trị quá ngắn hoặc quá nhỏ.',
  too_big: 'Giá trị quá dài hoặc quá lớn.',
  unrecognized_keys: 'Trường này không được hỗ trợ.',
};

/** Vietnamese text of a field error `code` (a schema issue code such as `too_small`). */
export function fieldMessage(code: string): string {
  return FIELD_MESSAGES[code] ?? 'Giá trị không hợp lệ.';
}
