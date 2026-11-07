<?php
// api.php - PHP REST API Fallback for Laragon Apache
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$storageDir = __DIR__ . '/.storage';
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0777, true);
}

$action = $_GET['action'] ?? '';
$pairCode = strtoupper(trim($_GET['pairCode'] ?? ''));

// Handle POST send
if ($_SERVER['REQUEST_METHOD'] === 'POST' || $action === 'send') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $code = strtoupper(trim($input['pairCode'] ?? ''));
    $url = trim($input['url'] ?? '');
    $title = trim($input['title'] ?? '') ?: $url;
    $sender = trim($input['sender'] ?? 'Device');

    if (empty($code) || empty($url)) {
        http_response_code(400);
        echo json_encode(['success' => false, error => 'pairCode and url are required']);
        exit;
    }

    $file = $storageDir . '/' . md5($code) . '.json';
    $data = file_exists($file) ? (json_decode(file_get_contents($file), true) ?? []) : [];

    $item = [
        'id' => 'link_' . round(microtime(true) * 1000) . '_' . substr(md5(uniqid()), 0, 5),
        'url' => $url,
        'title' => $title,
        'sender' => $sender,
        'timestamp' => round(microtime(true) * 1000)
    ];

    array_unshift($data, $item);
    if (count($data) > 30) {
        $data = array_slice($data, 0, 30);
    }

    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
    echo json_encode(['success' => true, 'link' => $item]);
    exit;
}

// Handle GET poll
if ($action === 'poll' || isset($_GET['pairCode'])) {
    if (empty($pairCode)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'pairCode required']);
        exit;
    }

    $since = (int)($_GET['since'] ?? 0);
    $file = $storageDir . '/' . md5($pairCode) . '.json';
    $data = file_exists($file) ? (json_decode(file_get_contents($file), true) ?? []) : [];

    $newLinks = [];
    foreach ($data as $item) {
        if (($item['timestamp'] ?? 0) > $since) {
            $newLinks[] = $item;
        }
    }

    echo json_encode([
        'success' => true,
        'links' => $newLinks,
        'lastTimestamp' => round(microtime(true) * 1000)
    ]);
    exit;
}

echo json_encode(['status' => 'ok', 'platform' => 'php', 'time' => date('c')]);
