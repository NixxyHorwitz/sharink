<?php
// index.php - Sharink Web Companion / Laragon Entry
$publicIndex = __DIR__ . '/public/index.html';
if (file_exists($publicIndex)) {
    // Read and serve public/index.html with correct asset paths if loaded via Apache
    $html = file_get_contents($publicIndex);
    // Replace relative links to public/ folder
    $html = str_replace('href="style.css"', 'href="public/style.css"', $html);
    $html = str_replace('src="app.js"', 'src="public/app.js"', $html);
    $html = str_replace('src="icon48.png"', 'src="public/icon48.png"', $html);
    $html = str_replace('href="icon48.png"', 'href="public/icon48.png"', $html);
    $html = str_replace('src="couple.jpg"', 'src="public/couple.jpg"', $html);
    echo $html;
} else {
    echo "<h1>Sharink Server</h1><p>Public directory not found.</p>";
}

