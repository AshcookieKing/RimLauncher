/**
 * Минимальная часть Arma3Map / mapUtils.js для Leaflet CRS и сетки координат.
 * Источник: https://github.com/jetelain/Arma3Map (MIT, Philippe Étélat / jetelain)
 */
(function (window) {
  'use strict';

  function MGRS_CRS(factorx, factory, tileWidth) {
    return L.extend({}, L.CRS.Simple, {
      projection: L.Projection.LonLat,
      transformation: new L.Transformation(factorx, 0, -factory, tileWidth),
      scale: function (zoom) {
        return Math.pow(2, zoom);
      },
      zoom: function (scale) {
        return Math.log(scale) / Math.LN2;
      },
      distance: function (latlng1, latlng2) {
        var dx = latlng2.lng - latlng1.lng;
        var dy = latlng2.lat - latlng1.lat;
        return Math.sqrt(dx * dx + dy * dy);
      },
      infinite: true,
    });
  }

  window.Arma3Map = {
    Maps: {},
    toCoord: function (num, precision) {
      if (precision === undefined || precision > 5) precision = 4;
      if (num <= 0) return '0'.repeat(precision);
      var numText = '00000' + num.toFixed(0);
      return numText.substr(numText.length - 5, precision);
    },
    toGrid: function (latlng, precision) {
      return Arma3Map.toCoord(latlng.lng, precision) + ' - ' + Arma3Map.toCoord(latlng.lat, precision);
    },
    bearing: function (latlng1, latlng2) {
      return (
        (Math.atan2(latlng2.lng - latlng1.lng, latlng2.lat - latlng1.lat) * 180) / Math.PI +
        360
      ) % 360;
    },
  };

  window.MGRS_CRS = MGRS_CRS;
})(typeof window !== 'undefined' ? window : this);
