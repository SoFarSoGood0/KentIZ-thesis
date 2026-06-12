import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

const String _mobileDefaultApiBaseUrl = 'http://10.0.2.2:8000';
const String _webDefaultApiBaseUrl = 'http://127.0.0.1:8000';

final String kUrbanChainApiBaseUrl = _resolveApiBaseUrl();

String _resolveApiBaseUrl() {
  const configured =
      String.fromEnvironment('URBANCHAIN_API_BASE_URL', defaultValue: '');
  final trimmed = configured.trim();
  if (trimmed.isNotEmpty) {
    return trimmed;
  }
  return kIsWeb ? _webDefaultApiBaseUrl : _mobileDefaultApiBaseUrl;
}

class UrbanChainApi {
  UrbanChainApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Uri _uri(String path, [Map<String, Object?>? query]) {
    return Uri.parse('$kUrbanChainApiBaseUrl$path').replace(
        queryParameters:
            query?.map((key, value) => MapEntry(key, value?.toString())));
  }

  Future<CitizenRegisterResult> registerCitizen({
    required String fullName,
    required String email,
    required String password,
  }) async {
    final response = await _client.post(
      _uri('/citizen/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'full_name': fullName,
        'email': email,
        'password': password,
      }),
    );
    _check(response);
    return CitizenRegisterResult.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<CitizenSession> verifyCitizen({
    required String email,
    required String code,
  }) async {
    final response = await _client.post(
      _uri('/citizen/verify'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'code': code}),
    );
    _check(response);
    return CitizenSession.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<CitizenSession> loginCitizen({
    required String email,
    required String password,
  }) async {
    final response = await _client.post(
      _uri('/citizen/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    _check(response);
    return CitizenSession.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<PublicSummary> fetchSummary() async {
    final response = await _client.get(_uri('/public/summary'));
    _check(response);
    return PublicSummary.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<CitizenSummary> fetchCitizenSummary({required String token}) async {
    final response = await _client.get(
      _uri('/citizen/summary'),
      headers: _authHeaders(token),
    );
    _check(response);
    return CitizenSummary.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<LocationLabel> reverseGeocode({
    required double latitude,
    required double longitude,
  }) async {
    final response = await _client.get(
      _uri('/geo/reverse', {
        'latitude': latitude,
        'longitude': longitude,
      }),
    );
    _check(response);
    return LocationLabel.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<List<PublicReport>> fetchPublicReports({int limit = 12}) async {
    final response =
        await _client.get(_uri('/public/reports', {'limit': limit}));
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final reports = (body['reports'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(PublicReport.fromListJson)
        .toList();
    return reports;
  }

  Future<List<PublicReport>> fetchCitizenReports({
    required String token,
    int limit = 30,
    int offset = 0,
  }) async {
    final response = await _client.get(
      _uri('/citizen/reports', {
        'limit': limit,
        'offset': offset,
      }),
      headers: _authHeaders(token),
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['reports'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(PublicReport.fromDetailJson)
        .toList();
  }

  Future<PublicReport> submitReport({
    required Uint8List fileBytes,
    required String fileName,
    required double latitude,
    required double longitude,
    String? token,
  }) async {
    final request = http.MultipartRequest(
      'POST',
      _uri('/predict', {
        'browser_latitude': latitude,
        'browser_longitude': longitude,
      }),
    );
    if (token != null && token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    request.files.add(
        http.MultipartFile.fromBytes('file', fileBytes, filename: fileName));
    final streamed = await _client.send(request);
    final response = await http.Response.fromStream(streamed);
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final reportId = (body['report_id'] as num?)?.toInt();
    if (reportId == null) {
      throw ApiException(500, 'report_id missing in predict response');
    }
    if (token != null && token.isNotEmpty) {
      return fetchCitizenReportDetail(reportId, token: token);
    }
    return fetchPublicReportDetail(reportId);
  }

  Future<PublicReport> fetchPublicReportDetail(int reportId) async {
    final response = await _client.get(_uri('/public/reports/$reportId'));
    _check(response);
    return PublicReport.fromDetailJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<PublicReport> fetchCitizenReportDetail(
    int reportId, {
    required String token,
  }) async {
    final response = await _client.get(
      _uri('/citizen/reports/$reportId'),
      headers: _authHeaders(token),
    );
    _check(response);
    return PublicReport.fromDetailJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<List<AppNotification>> fetchNotifications({
    int limit = 10,
    String? token,
  }) async {
    if (token != null && token.isNotEmpty) {
      final response = await _client.get(
        _uri('/citizen/notifications', {'limit': limit}),
        headers: _authHeaders(token),
      );
      _check(response);
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return (body['notifications'] as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>()
          .map(AppNotification.fromJson)
          .toList();
    }
    final reports = await fetchPublicReports(limit: limit);
    final details = <PublicReport>[];
    for (final report in reports) {
      try {
        details.add(await fetchPublicReportDetail(report.id));
      } catch (_) {
        // Skip broken items so the whole notification screen still works.
      }
    }
    return details.map(buildNotificationFromReport).toList();
  }

  Future<void> requestPasswordReset(String email) async {
    final response = await _client.post(
      _uri('/citizen/password-reset/request'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email}),
    );
    _check(response);
  }

  Future<int> fetchUnreadCount({required String token}) async {
    try {
      final response = await _client.get(
        _uri('/citizen/notifications', {'limit': 1}),
        headers: _authHeaders(token),
      );
      if (response.statusCode != 200) return 0;
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return (body['unread_count'] as int?) ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<int> markNotificationsSeen({required String token}) async {
    final response = await _client.post(
      _uri('/citizen/notifications/mark-seen'),
      headers: _authHeaders(token),
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['updated'] as num?)?.toInt() ?? 0;
  }

  void dispose() {
    _client.close();
  }

  void _check(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }
    throw ApiException(response.statusCode, _errorMessage(response.body));
  }

  Map<String, String> _authHeaders(String token) {
    return {'Authorization': 'Bearer $token'};
  }
}

String _errorMessage(String body) {
  try {
    final decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) {
      final detail = decoded['detail'];
      if (detail is String && detail.trim().isNotEmpty) return detail;
      final message = decoded['message'];
      if (message is String && message.trim().isNotEmpty) return message;
    }
  } catch (_) {
    // Keep raw body below.
  }
  return body;
}

class CitizenRegisterResult {
  const CitizenRegisterResult({
    required this.email,
    required this.message,
    this.developmentCode,
  });

  final String email;
  final String message;
  final String? developmentCode;

  factory CitizenRegisterResult.fromJson(Map<String, dynamic> json) {
    return CitizenRegisterResult(
      email: (json['email'] as String?) ?? '',
      message: (json['message'] as String?) ?? 'Doğrulama kodu gönderildi.',
      developmentCode: json['development_code'] as String?,
    );
  }
}

class CitizenSession {
  const CitizenSession({
    required this.token,
    required this.fullName,
    required this.email,
  });

  final String token;
  final String fullName;
  final String email;

  factory CitizenSession.fromJson(Map<String, dynamic> json) {
    return CitizenSession(
      token: (json['token'] as String?) ?? '',
      fullName: (json['full_name'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
    );
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.body);

  final int statusCode;
  final String body;

  @override
  String toString() => 'ApiException($statusCode): $body';
}

class PublicSummary {
  const PublicSummary({
    required this.totalReports,
    required this.approvedReports,
    required this.resolvedReports,
    required this.reportsByType,
    required this.reportsByProvince,
    required this.topProvinces,
    required this.activeProvincesCount,
    required this.recentDailyReports,
  });

  final int totalReports;
  final int approvedReports;
  final int resolvedReports;
  final Map<String, int> reportsByType;
  final Map<String, int> reportsByProvince;
  final List<ProvinceStat> topProvinces;
  final int activeProvincesCount;
  final List<DailyReportStat> recentDailyReports;

  factory PublicSummary.fromJson(Map<String, dynamic> json) {
    return PublicSummary(
      totalReports: (json['total_reports'] as num?)?.toInt() ?? 0,
      approvedReports: (json['approved_reports'] as num?)?.toInt() ?? 0,
      resolvedReports: (json['resolved_reports'] as num?)?.toInt() ?? 0,
      reportsByType: _intMap(json['reports_by_type']),
      reportsByProvince: _intMap(json['reports_by_province']),
      topProvinces: (json['top_provinces'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ProvinceStat.fromJson)
          .toList(),
      activeProvincesCount:
          (json['active_provinces_count'] as num?)?.toInt() ?? 0,
      recentDailyReports:
          (json['recent_daily_reports'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(DailyReportStat.fromJson)
              .toList(),
    );
  }
}

class CitizenSummary {
  const CitizenSummary({
    required this.totalReports,
    required this.pendingReviewReports,
    required this.approvedReports,
    required this.resolvedReports,
    required this.inProgressReports,
    required this.rejectedReports,
  });

  final int totalReports;
  final int pendingReviewReports;
  final int approvedReports;
  final int resolvedReports;
  final int inProgressReports;
  final int rejectedReports;

  factory CitizenSummary.fromJson(Map<String, dynamic> json) {
    return CitizenSummary(
      totalReports: (json['total_reports'] as num?)?.toInt() ?? 0,
      pendingReviewReports:
          (json['pending_review_reports'] as num?)?.toInt() ?? 0,
      approvedReports: (json['approved_reports'] as num?)?.toInt() ?? 0,
      resolvedReports: (json['resolved_reports'] as num?)?.toInt() ?? 0,
      inProgressReports: (json['in_progress_reports'] as num?)?.toInt() ?? 0,
      rejectedReports: (json['rejected_reports'] as num?)?.toInt() ?? 0,
    );
  }
}

class LocationLabel {
  const LocationLabel({
    required this.province,
    required this.district,
    required this.neighborhood,
    required this.source,
  });

  final String province;
  final String district;
  final String neighborhood;
  final String source;

  String get displayText {
    final parts = [neighborhood, district, province]
        .where((value) => value.trim().isNotEmpty)
        .toList();
    if (parts.isNotEmpty) {
      return parts.join(', ');
    }
    return 'Konum bulunamadi';
  }

  factory LocationLabel.fromJson(Map<String, dynamic> json) {
    return LocationLabel(
      province: (json['province'] as String?)?.trim() ?? '',
      district: (json['district'] as String?)?.trim() ?? '',
      neighborhood: (json['neighborhood'] as String?)?.trim() ?? '',
      source: (json['source'] as String?)?.trim() ?? '',
    );
  }
}

class ProvinceStat {
  const ProvinceStat({required this.province, required this.count});

  final String province;
  final int count;

  factory ProvinceStat.fromJson(Map<String, dynamic> json) {
    return ProvinceStat(
      province: (json['province'] as String?)?.trim().isNotEmpty == true
          ? json['province'] as String
          : 'Bilinmiyor',
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }
}

class DailyReportStat {
  const DailyReportStat({required this.day, required this.count});

  final String day;
  final int count;

  factory DailyReportStat.fromJson(Map<String, dynamic> json) {
    return DailyReportStat(
      day: (json['day'] as String?) ?? '',
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }
}

class PublicReport {
  const PublicReport({
    required this.id,
    required this.createdAt,
    required this.reportType,
    required this.status,
    required this.topConfidence,
    required this.priorityScore,
    required this.priorityLabel,
    required this.gps,
    required this.afterImageAvailable,
    this.province,
    this.district,
    this.neighborhood,
    this.savedAs,
    this.locationStatus,
    this.interventionStatus,
    this.assignedTeam,
    this.afterImageUrl,
    this.notes,
    this.statusUpdatedAt,
  });

  final int id;
  final DateTime? createdAt;
  final String reportType;
  final String status;
  final double topConfidence;
  final int priorityScore;
  final String priorityLabel;
  final Map<String, double>? gps;
  final bool afterImageAvailable;
  final String? province;
  final String? district;
  final String? neighborhood;
  final String? savedAs;
  final String? locationStatus;
  final String? interventionStatus;
  final String? assignedTeam;
  final String? afterImageUrl;
  final String? notes;
  final DateTime? statusUpdatedAt;

  factory PublicReport.fromListJson(Map<String, dynamic> json) {
    final priority = (json['priority'] as Map<String, dynamic>?) ?? const {};
    final gps = _doubleMap(json['gps']);
    return PublicReport(
      id: (json['id'] as num?)?.toInt() ?? 0,
      createdAt: _parseDate(json['created_at']),
      reportType: (json['report_type'] as String?) ?? '',
      status: (json['status'] as String?) ?? '',
      topConfidence: (json['top_confidence'] as num?)?.toDouble() ?? 0,
      priorityScore: (priority['score'] as num?)?.toInt() ?? 0,
      priorityLabel: (priority['label'] as String?) ?? 'low',
      gps: gps,
      afterImageAvailable: json['after_image_available'] == true,
    );
  }

  factory PublicReport.fromDetailJson(Map<String, dynamic> json) {
    final priority = (json['priority'] as Map<String, dynamic>?) ?? const {};
    final gps = _doubleMap(json['gps']);
    final locationScope =
        (json['location_scope'] as Map<String, dynamic>?) ?? const {};
    final assignment =
        (json['assignment'] as Map<String, dynamic>?) ?? const {};
    final afterImage = json['after_image'] as Map<String, dynamic>?;
    return PublicReport(
      id: (json['id'] as num?)?.toInt() ?? 0,
      createdAt: _parseDate(json['created_at']),
      reportType: (json['report_type'] as String?) ?? '',
      status: (json['status'] as String?) ?? '',
      topConfidence: (json['top_confidence'] as num?)?.toDouble() ?? 0,
      priorityScore: (priority['score'] as num?)?.toInt() ?? 0,
      priorityLabel: (priority['label'] as String?) ?? 'low',
      gps: gps,
      afterImageAvailable: afterImage != null,
      province: (locationScope['province'] as String?)?.trim(),
      district: (locationScope['district'] as String?)?.trim(),
      neighborhood: (locationScope['neighborhood'] as String?)?.trim(),
      savedAs: (json['saved_as'] as String?)?.trim(),
      locationStatus:
          (json['location'] as Map<String, dynamic>?)?['status'] as String?,
      interventionStatus: assignment['intervention_status'] as String?,
      assignedTeam: assignment['assigned_team'] as String?,
      afterImageUrl: () {
        final u = afterImage?['url'] as String?;
        if (u == null) return null;
        return u.startsWith('/') ? '$kUrbanChainApiBaseUrl$u' : u;
      }(),
      notes: (json['notes'] as String?)?.trim(),
      statusUpdatedAt: _parseDate(json['status_updated_at']),
    );
  }

  String get displayType => trReportType(reportType);
  String get displayStatus {
    if (interventionStatus == 'resolved')    return 'Çözüldü';
    if (interventionStatus == 'in_progress') return 'İşlemde';
    if (interventionStatus == 'assigned')    return 'Ekip Atandı';
    return trStatus(status);
  }
  String get displayPriority => trPriorityLabel(priorityLabel);
  String get locationText =>
      _joinLocation(province, district, neighborhood) ??
      (gps == null ? 'Konum yok' : 'GPS konumu mevcut');
  String get imageUrl => savedAs == null || savedAs!.isEmpty
      ? 'https://picsum.photos/seed/urbanchain/$id/400/240'
      : '$kUrbanChainApiBaseUrl/uploads/$savedAs';
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.message,
    required this.reportId,
    required this.date,
    required this.isRead,
  });

  final int id;
  final String icon;
  final int iconColor;
  final int iconBg;
  final String title;
  final String message;
  final int reportId;
  final String date;
  final bool isRead;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final payload = (json['payload'] as Map<String, dynamic>?) ?? const {};
    final type = (json['type'] as String?) ?? '';
    final status = (payload['status'] as String?) ?? type;
    final icon = switch (status) {
      'resolved' => 'check_circle',
      'assigned' => 'people',
      'in_progress' => 'handyman',
      'approved' => 'check_circle',
      'rejected' => 'warning',
      _ => 'notifications',
    };
    final iconColor = switch (status) {
      'resolved' => 0xFF059669,
      'assigned' => 0xFF7C3AED,
      'in_progress' => 0xFFD97706,
      'approved' => 0xFF0891B2,
      'rejected' => 0xFFDC2626,
      _ => 0xFF0891B2,
    };
    final iconBg = switch (status) {
      'resolved' => 0xFFECFDF5,
      'assigned' => 0xFFF5F3FF,
      'in_progress' => 0xFFFFFBEB,
      'approved' => 0xFFECFEFF,
      'rejected' => 0xFFFEE2E2,
      _ => 0xFFEFF6FF,
    };
    final reportId = (json['report_id'] as num?)?.toInt() ?? 0;
    return AppNotification(
      id: (json['id'] as num?)?.toInt() ?? 0,
      icon: icon,
      iconColor: iconColor,
      iconBg: iconBg,
      title: (json['title'] as String?) ?? '',
      message: (json['message'] as String?) ?? '',
      reportId: reportId,
      date: formatRelativeDate(_parseDate(json['created_at'])),
      isRead: json['seen_at'] != null,
    );
  }
}

AppNotification buildNotificationFromReport(PublicReport report) {
  final isRead = report.status == 'approved' || report.status == 'rejected';
  final type = report.interventionStatus ?? report.status;
  final title = switch (type) {
    'resolved' => 'Raporunuz çözüldü! 🎉',
    'assigned' => 'Ekibe atandı',
    'in_progress' => 'Çalışma başladı',
    'approved' => 'Raporunuz onaylandı',
    'rejected' => 'Raporunuz reddedildi',
    _ => 'Rapor durumu güncellendi',
  };
  final message = switch (type) {
    'resolved' =>
      '${report.locationText} adresindeki ${trReportType(report.reportType).toLowerCase()} tamamlandı.',
    'assigned' => '${report.displayType} kaydınız saha ekibine atandı.',
    'in_progress' => '${report.locationText} için saha çalışmaları başladı.',
    'approved' =>
      '${report.displayType} kaydınız belediye tarafından onaylandı.',
    'rejected' => '${report.displayType} kaydınız incelenip reddedildi.',
    _ => '${report.displayType} kaydınızın durumu güncellendi.',
  };
  final icon = switch (type) {
    'resolved' => 'check_circle',
    'assigned' => 'people',
    'in_progress' => 'handyman',
    'approved' => 'check_circle',
    'rejected' => 'warning',
    _ => 'notifications',
  };
  final iconColor = switch (type) {
    'resolved' => 0xFF059669,
    'assigned' => 0xFF7C3AED,
    'in_progress' => 0xFFD97706,
    'approved' => 0xFF0891B2,
    'rejected' => 0xFFDC2626,
    _ => 0xFF0891B2,
  };
  final iconBg = switch (type) {
    'resolved' => 0xFFECFDF5,
    'assigned' => 0xFFF5F3FF,
    'in_progress' => 0xFFFFFBEB,
    'approved' => 0xFFECFEFF,
    'rejected' => 0xFFFEE2E2,
    _ => 0xFFEFF6FF,
  };
  return AppNotification(
    id: report.id,
    icon: icon,
    iconColor: iconColor,
    iconBg: iconBg,
    title: title,
    message: message,
    reportId: report.id,
    date: formatRelativeDate(report.createdAt),
    isRead: isRead,
  );
}

String trReportType(String type) {
  switch (type) {
    case 'pothole':            return 'Yol Çukuru';
    case 'garbage':            return 'Çöp';
    case 'sidewalk':           return 'Kaldırım Hasarı';
    case 'road_damage':        return 'Yol Hasarı';
    case 'pavement_damage':    return 'Kaldırım Hasarı';
    case 'alligator_crack':    return 'Çatlak';
    case 'block_crack':        return 'Çatlak';
    case 'longitudinal_crack': return 'Çatlak';
    case 'oblique_crack':      return 'Çatlak';
    case 'transverse_crack':   return 'Çatlak';
    case 'repair':             return 'Onarım İhtiyacı';
    default:                   return _titleCase(type);
  }
}

String trStatus(String status) {
  switch (status) {
    case 'pending_review': return 'İncelemede';
    case 'in_review':      return 'İncelemede';
    case 'approved':       return 'Onaylandı';
    case 'rejected':       return 'Reddedildi';
    default:               return _titleCase(status);
  }
}

String trPriorityLabel(String label) {
  switch (label) {
    case 'critical':
      return 'Kritik';
    case 'high':
      return 'Yüksek';
    case 'medium':
      return 'Orta';
    case 'low':
      return 'Düşük';
    default:
      return _titleCase(label);
  }
}

String? _joinLocation(
    String? province, String? district, String? neighborhood) {
  final parts = [province, district, neighborhood]
      .where((v) => v != null && v.trim().isNotEmpty)
      .map((v) => v!.trim())
      .toList();
  if (parts.isEmpty) {
    return null;
  }
  return parts.join(' / ');
}

String _titleCase(String value) {
  if (value.trim().isEmpty) {
    return value;
  }
  return value
      .split(RegExp(r'[_\s-]+'))
      .where((part) => part.isNotEmpty)
      .map((part) => part[0].toUpperCase() + part.substring(1).toLowerCase())
      .join(' ');
}

Map<String, int> _intMap(dynamic value) {
  if (value is! Map) return {};
  return value.map<String, int>((key, raw) => MapEntry(key.toString(),
      raw is num ? raw.toInt() : int.tryParse(raw.toString()) ?? 0));
}

Map<String, double>? _doubleMap(dynamic value) {
  if (value is! Map) return null;
  return value.map<String, double>((key, raw) => MapEntry(key.toString(),
      raw is num ? raw.toDouble() : double.tryParse(raw.toString()) ?? 0.0));
}

DateTime? _parseDate(dynamic value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value);
}

String formatRelativeDate(DateTime? date) {
  if (date == null) {
    return 'Bilinmiyor';
  }
  final now = DateTime.now();
  final diff = now.difference(date.toLocal());
  if (diff.inMinutes < 60) {
    return '${diff.inMinutes} dk önce';
  }
  if (diff.inHours < 24) {
    return '${diff.inHours} sa önce';
  }
  return '${diff.inDays} gün önce';
}
