/*
  Экранирование строки для подстановки в SQL (одинарная кавычка → '').
*/
params [["_text", "", [""]]];
private _t = if (_text isEqualType "") then {_text} else {str _text};
(_t splitString "'") joinString "''";
