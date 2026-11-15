import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailTransport } from '../../../shared/application/mail-transport.js';
import { IdentityMailer, type EmailLink } from '../application/ports.js';

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
});

@Injectable()
export class EmailIdentityMailer extends IdentityMailer {
  private readonly frontendUrl: string;

  constructor(
    private readonly transport: MailTransport,
    config: ConfigService,
  ) {
    super();
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  /** Code only: a link here would let the mailbox owner confirm a sign-up a stranger started (audit R3-N1). */
  sendRegistrationCode(to: string, name: string, code: string, expiresAt: Date) {
    return this.transport.send({
      to,
      subject: `${code} là mã xác thực tài khoản Online Judge`,
      text: `Chào ${name},\n\nMã xác thực của bạn là: ${code}\nMã có hiệu lực đến ${timeFmt.format(expiresAt)}.\n\nNếu bạn không đăng ký, hãy bỏ qua email này.`,
      html: layout(`<p>Chào ${esc(name)},</p>
        <p>Nhập mã dưới đây để hoàn tất đăng ký tài khoản học sinh:</p>
        ${codeBlock(code)}
        <p style="color:#555">Mã có hiệu lực đến ${timeFmt.format(expiresAt)}. Nếu bạn không đăng ký, hãy bỏ qua email này.</p>`),
    });
  }

  /** Link only: a 6-digit reset code could be guessed and its attempts used up by others (audit R3-N2). */
  sendPasswordResetLink(to: string, name: string, link: EmailLink, expiresAt: Date) {
    const url = this.linkTo('/forgot-password', link);
    return this.transport.send({
      to,
      subject: 'Đặt lại mật khẩu Online Judge',
      text: `Chào ${name},\n\nMở liên kết sau để đặt mật khẩu mới:\n${url}\n\nLiên kết có hiệu lực đến ${timeFmt.format(expiresAt)} và chỉ dùng được một lần.\n\nNếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn vẫn giữ nguyên.`,
      html: layout(`<p>Chào ${esc(name)},</p>
        <p>Bấm nút dưới đây để đặt mật khẩu mới:</p>
        ${button(url, 'Đặt mật khẩu mới')}
        <p style="color:#555">Liên kết có hiệu lực đến ${timeFmt.format(expiresAt)} và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu vẫn giữ nguyên.</p>`),
    });
  }

  /** The secret travels in the URL fragment, so it is not sent to any server or written to access logs on the way. */
  private linkTo(path: string, link: EmailLink) {
    return `${this.frontendUrl}${path}?v=${encodeURIComponent(link.verificationId)}#t=${encodeURIComponent(link.token)}`;
  }

  sendAccountExistsNotice(to: string, name: string) {
    return this.transport.send({
      to,
      subject: 'Email của bạn đã có tài khoản Online Judge',
      text: `Chào ${name},\n\nVừa có người dùng địa chỉ email này để đăng ký tài khoản Online Judge, nhưng email này đã có tài khoản.\nNếu là bạn, hãy đăng nhập, hoặc dùng "Quên mật khẩu" nếu bạn không nhớ mật khẩu.\n\nNếu không phải bạn, hãy bỏ qua email này — tài khoản của bạn không bị thay đổi.`,
      html: layout(`<p>Chào ${esc(name)},</p>
        <p>Vừa có người dùng địa chỉ email này để đăng ký tài khoản Online Judge, nhưng email này <b>đã có tài khoản</b>.</p>
        <p>Nếu là bạn, hãy đăng nhập, hoặc dùng "Quên mật khẩu" nếu bạn không nhớ mật khẩu.</p>
        <p style="color:#555">Nếu không phải bạn, hãy bỏ qua email này — tài khoản của bạn không bị thay đổi.</p>`),
    });
  }

  sendSignInBlockedNotice(to: string, name: string) {
    return this.transport.send({
      to,
      subject: 'Đăng nhập vào tài khoản Online Judge của bạn đang tạm bị chặn',
      text: `Chào ${name},\n\nCó nhiều lần nhập sai mật khẩu cho tài khoản của bạn từ nhiều địa chỉ khác nhau, nên đăng nhập từ địa chỉ mới đang tạm bị chặn trong tối đa 1 giờ.\nBạn vẫn đăng nhập được từ thiết bị và mạng bạn thường dùng.\n\nNếu cần vào ngay, hãy dùng "Quên mật khẩu" để đặt mật khẩu mới: việc này cũng gỡ chặn. Nếu mật khẩu của bạn ngắn hoặc dễ đoán, hãy đổi mật khẩu.`,
      html: layout(`<p>Chào ${esc(name)},</p>
        <p>Có nhiều lần nhập sai mật khẩu cho tài khoản của bạn từ nhiều địa chỉ khác nhau, nên đăng nhập từ địa chỉ mới đang <b>tạm bị chặn</b> trong tối đa 1 giờ.</p>
        <p>Bạn vẫn đăng nhập được từ thiết bị và mạng bạn thường dùng.</p>
        <p style="color:#555">Nếu cần vào ngay, hãy dùng "Quên mật khẩu" để đặt mật khẩu mới: việc này cũng gỡ chặn. Nếu mật khẩu của bạn ngắn hoặc dễ đoán, hãy đổi mật khẩu.</p>`),
    });
  }

  sendTeacherInvitation(to: string, name: string, acceptUrl: string, code: string, expiresAt: Date) {
    return this.transport.send({
      to,
      subject: 'Lời mời tham gia Online Judge với vai trò giáo viên',
      text: `Chào ${name},\n\nBạn được mời tham gia Online Judge với vai trò giáo viên.\nMở liên kết sau để đặt mật khẩu và kích hoạt tài khoản:\n${acceptUrl}\n\nMã xác thực: ${code}\nLời mời có hiệu lực đến ${timeFmt.format(expiresAt)}.`,
      html: layout(`<p>Chào ${esc(name)},</p>
        <p>Bạn được mời tham gia Online Judge với vai trò <b>giáo viên</b>. Bấm nút dưới đây để đặt mật khẩu và kích hoạt tài khoản.</p>
        <p style="margin:24px 0"><a href="${esc(acceptUrl)}" style="background:#4A2FA0;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Kích hoạt tài khoản</a></p>
        <p>Nếu được hỏi mã xác thực, hãy nhập:</p>
        ${codeBlock(code)}
        <p style="color:#555">Lời mời có hiệu lực đến ${timeFmt.format(expiresAt)}.</p>`),
    });
  }

  sendOrganizationInvitation(to: string, name: string, organizationName: string, homeUrl: string, expiresAt: Date) {
    return this.transport.send({
      to,
      subject: `Lời mời tham gia tổ chức ${organizationName} trên Online Judge`,
      text: `Chào ${name},\n\nBạn được mời tham gia tổ chức ${organizationName} trên Online Judge.\nĐăng nhập rồi chấp nhận hoặc từ chối lời mời ở trang chủ:\n${homeUrl}\n\nLời mời có hiệu lực đến ${timeFmt.format(expiresAt)}.`,
      html: layout(`<p>Chào ${esc(name)},</p>
        <p>Bạn được mời tham gia tổ chức <b>${esc(organizationName)}</b> trên Online Judge. Đăng nhập rồi chấp nhận hoặc từ chối lời mời ở trang chủ.</p>
        ${button(homeUrl, 'Mở Online Judge')}
        <p style="color:#555">Lời mời có hiệu lực đến ${timeFmt.format(expiresAt)}.</p>`),
    });
  }
}

function button(url: string, label: string) {
  return `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#4A2FA0;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
}

function codeBlock(code: string) {
  return `<p style="font:700 28px/1.2 'Courier New',monospace;letter-spacing:6px;color:#4A2FA0;margin:16px 0">${code}</p>`;
}

function layout(body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#232838;max-width:520px">
    <p style="font-weight:700;color:#4A2FA0">Online Judge</p>${body}</div>`;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
